// Unified Redis adapter that works with both ioredis and Upstash Redis

import {
  IAdapter,
  SessionMetadata,
  SearchQuery,
  SearchResponse,
  Logger,
} from '../types';
import { BaseSearchAdapter, SearchConfig, DocumentData } from './base-search';
import { UnifiedRedisInterface } from './redis-clients';

export interface UnifiedRedisAdapterConfig {
  redis: UnifiedRedisInterface;
  keyPrefix?: string;
  searchConfig?: Partial<SearchConfig>;
  logger?: Logger;
  ttl?: {
    session: number;
    document: number;
    index: number;
  };
}

/**
 * Unified Redis adapter that eliminates duplication between Redis implementations
 * Works with both regular Redis (ioredis) and Upstash Redis (HTTP-based)
 */
export class UnifiedRedisAdapter extends BaseSearchAdapter implements IAdapter {
  private redis: UnifiedRedisInterface;
  private keyPrefix: string;
  private logger: Logger | undefined;
  private ttl: {
    session: number;
    document: number;
    index: number;
  };

  constructor(config: UnifiedRedisAdapterConfig) {
    super(config.searchConfig);
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'pnp-ws:';
    this.logger = config.logger;
    this.ttl = {
      session: 24 * 60 * 60, // 24 hours
      document: 7 * 24 * 60 * 60, // 7 days
      index: 7 * 24 * 60 * 60, // 7 days
      ...config.ttl,
    };
  }

  private getKey(type: string, id: string): string {
    return `${this.keyPrefix}${type}:${id}`;
  }

  // Session Management
  async setSession(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const key = this.getKey('session', sessionId);
    const flatData: string[] = [];
    
    // Flatten data for HSET
    flatData.push('id', metadata.id);
    flatData.push('connectedAt', metadata.connectedAt.toISOString());
    flatData.push('lastSeenAt', metadata.lastSeenAt.toISOString());
    
    if (metadata.userId) flatData.push('userId', metadata.userId);
    if (metadata.tabId) flatData.push('tabId', metadata.tabId);
    if (metadata.userAgent) flatData.push('userAgent', metadata.userAgent);
    if (metadata.ip) flatData.push('ip', metadata.ip);
    if (metadata.metadata) flatData.push('metadata', JSON.stringify(metadata.metadata));
    
    await this.redis.pipeline([
      ['HSET', key, ...flatData],
      ['EXPIRE', key, this.ttl.session.toString()],
      ['SADD', this.getKey('sessions', 'active'), sessionId],
    ]);
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const key = this.getKey('session', sessionId);
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0 || !data.id) {
      return null;
    }

    return {
      id: data.id,
      ...(data.userId && { userId: data.userId }),
      ...(data.tabId && { tabId: data.tabId }),
      ...(data.userAgent && { userAgent: data.userAgent }),
      ...(data.ip && { ip: data.ip }),
      connectedAt: new Date(data.connectedAt || Date.now()),
      lastSeenAt: new Date(data.lastSeenAt || Date.now()),
      ...(data.metadata && { metadata: JSON.parse(data.metadata) }),
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = this.getKey('session', sessionId);
    await this.redis.pipeline([
      ['DEL', key],
      ['SREM', this.getKey('sessions', 'active'), sessionId],
    ]);
  }

  async getAllSessions(): Promise<SessionMetadata[]> {
    const sessionIds = await this.redis.smembers(this.getKey('sessions', 'active'));
    const sessions: SessionMetadata[] = [];
    
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      } else {
        // Cleanup stale session ID
        await this.redis.srem(this.getKey('sessions', 'active'), sessionId);
      }
    }
    
    return sessions;
  }

  async updateLastSeen(sessionId: string): Promise<void> {
    const key = this.getKey('session', sessionId);
    await this.redis.pipeline([
      ['HSET', key, 'lastSeenAt', new Date().toISOString()],
      ['EXPIRE', key, this.ttl.session.toString()],
    ]);
  }

  // Document Indexing
  async indexDocument(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Remove old index entries for this document first
    await this.removeDocument(id);

    const docKey = this.getKey('doc', id);
    
    // Generate search terms
    const { ngrams, edgegrams } = this.generateSearchTerms(content);
    
    // Track all terms for this document (for efficient removal)
    const allTerms = [...ngrams, ...edgegrams];
    
    const docData: string[] = [
      'content', content,
      'indexedAt', new Date().toISOString(),
      'terms', JSON.stringify(allTerms), // Store terms for efficient removal
    ];
    
    if (metadata) {
      docData.push('metadata', JSON.stringify(metadata));
    }

    // Prepare pipeline commands
    const commands: Array<[string, ...string[]]> = [
      ['HSET', docKey, ...docData],
      ['EXPIRE', docKey, this.ttl.document.toString()],
      ['SADD', this.getKey('docs', 'all'), id],
    ];

    // Add n-gram indexes
    for (const ngram of ngrams) {
      const ngramKey = this.getKey('ngram', ngram);
      commands.push(['SADD', ngramKey, id]);
      commands.push(['EXPIRE', ngramKey, this.ttl.index.toString()]);
    }

    // Add edge-gram indexes
    for (const edgegram of edgegrams) {
      const edgegramKey = this.getKey('edgegram', edgegram);
      commands.push(['SADD', edgegramKey, id]);
      commands.push(['EXPIRE', edgegramKey, this.ttl.index.toString()]);
    }

    await this.redis.pipeline(commands);
  }

  async removeDocument(id: string): Promise<void> {
    // Get document to retrieve indexed terms
    const docKey = this.getKey('doc', id);
    const doc = await this.redis.hgetall(docKey);
    
    if (doc && doc.terms) {
      try {
        const terms = JSON.parse(doc.terms) as string[];
        const commands: Array<[string, ...string[]]> = [];
        
        // Remove from all indexed terms efficiently
        for (const term of terms) {
          // Try both n-gram and edge-gram keys (one will be a no-op)
          const ngramKey = this.getKey('ngram', term);
          const edgegramKey = this.getKey('edgegram', term);
          commands.push(['SREM', ngramKey, id]);
          commands.push(['SREM', edgegramKey, id]);
        }
        
        // Remove document and from document list
        commands.push(['DEL', docKey]);
        commands.push(['SREM', this.getKey('docs', 'all'), id]);
        
        await this.redis.pipeline(commands);
      } catch (error) {
        // Fallback to old method if terms parsing fails
        this.logger?.warn?.('Failed to parse indexed terms, using fallback removal', { id, error });
        await this.removeDocumentFromIndexesFallback(id);
      }
    } else {
      // Document doesn't exist or has no terms - just clean up references
      await this.redis.pipeline([
        ['DEL', docKey],
        ['SREM', this.getKey('docs', 'all'), id],
      ]);
    }
  }

  private async removeDocumentFromIndexesFallback(id: string): Promise<void> {
    // This is the old inefficient method - only used as fallback for migration
    // TODO: Remove this method once all documents have been reindexed with terms tracking
    const [ngramKeys, edgegramKeys] = await Promise.all([
      this.redis.keys(this.getKey('ngram', '*')),
      this.redis.keys(this.getKey('edgegram', '*')),
    ]);

    const commands: Array<[string, ...string[]]> = [];
    for (const key of [...ngramKeys, ...edgegramKeys]) {
      commands.push(['SREM', key, id]);
    }
    
    // Remove document and from document list
    commands.push(['DEL', this.getKey('doc', id)]);
    commands.push(['SREM', this.getKey('docs', 'all'), id]);

    if (commands.length > 0) {
      await this.redis.pipeline(commands);
    }
  }

  // Search Implementation
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    
    // Add search timeout
    const searchTimeout = 10000; // 10 seconds timeout for Redis operations
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), searchTimeout);
    });
    
    try {
      const searchPromise = this.performSearch(query, startTime);
      return await Promise.race([searchPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Search timeout') {
        this.logger?.error?.('Search timeout exceeded', { 
          query: query.query, 
          timeout: searchTimeout 
        });
      }
      throw error;
    }
  }

  private async performSearch(query: SearchQuery, startTime: number): Promise<SearchResponse> {
    const { searchTerms, isValid } = this.normalizeSearchQuery(query);

    if (!isValid) {
      return this.createEmptyResponse(query, startTime);
    }

    // Collect matching document IDs with scores
    const documentScores = new Map<string, { score: number; data: DocumentData }>();

    // Process each search term
    for (const term of searchTerms) {
      const { ngrams, edgegrams } = this.generateSearchTerms(term);

      // Collect n-gram and edge-gram matches efficiently
      const ngramCommands: Array<[string, ...string[]]> = ngrams.map(ngram => 
        ['SMEMBERS', this.getKey('ngram', ngram)]
      );
      const edgegramCommands: Array<[string, ...string[]]> = edgegrams.map(edgegram => 
        ['SMEMBERS', this.getKey('edgegram', edgegram)]
      );

      // Execute all lookups in parallel using pipeline
      const [ngramResults, edgegramResults] = await Promise.all([
        this.redis.pipeline(ngramCommands),
        this.redis.pipeline(edgegramCommands),
      ]);

      // Process n-gram matches
      (ngramResults as string[][]).forEach(matchingDocs => {
        for (const docId of matchingDocs) {
          if (!documentScores.has(docId)) {
            documentScores.set(docId, { score: 0, data: { content: '' } });
          }
          documentScores.get(docId)!.score += this.searchConfig.ngramWeight;
        }
      });

      // Process edge-gram matches
      (edgegramResults as string[][]).forEach((matchingDocs, index) => {
        const edgegram = edgegrams[index];
        if (!edgegram) return;
        
        const boost = edgegram.length / this.searchConfig.maxEdgegram;
        
        for (const docId of matchingDocs) {
          if (!documentScores.has(docId)) {
            documentScores.set(docId, { score: 0, data: { content: '' } });
          }
          documentScores.get(docId)!.score += boost * this.searchConfig.edgegramWeight;
        }
      });
    }

    // Fetch document data for scoring candidates
    const docCommands: Array<[string, ...string[]]> = Array.from(documentScores.keys()).map(docId => 
      ['HGETALL', this.getKey('doc', docId)]
    );

    if (docCommands.length === 0) {
      return this.createEmptyResponse(query, startTime);
    }

    const docResults = await this.redis.pipeline(docCommands);

    // Process documents and calculate final scores
    let index = 0;
    for (const [docId, scoreData] of documentScores.entries()) {
      const docData = docResults[index] as Record<string, string>;
      index++;

      if (docData && docData.content) {
        const documentData: DocumentData = {
          content: docData.content,
          ...(docData.metadata && { metadata: JSON.parse(docData.metadata) }),
        };

        // Calculate final relevance score including exact matches
        const finalScore = this.calculateRelevanceScore(
          docData.content,
          searchTerms,
          0, // n-gram matches already counted
          0  // edge-gram matches already counted
        ) + scoreData.score;

        documentScores.set(docId, { score: finalScore, data: documentData });
      } else {
        // Remove documents that no longer exist
        documentScores.delete(docId);
      }
    }

    return this.processSearchResults(query, searchTerms, documentScores, startTime);
  }

  // Cleanup and Maintenance
  async cleanup(): Promise<void> {
    const sessionIds = await this.redis.smembers(this.getKey('sessions', 'active'));
    
    for (const sessionId of sessionIds) {
      const key = this.getKey('session', sessionId);
      const exists = await this.redis.exists(key);
      
      if (!exists) {
        await this.redis.srem(this.getKey('sessions', 'active'), sessionId);
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}
