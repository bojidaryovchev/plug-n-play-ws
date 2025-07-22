// Upstash Redis adapter for serverless environments

import {
  IAdapter,
  SessionMetadata,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../types';
import { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';

export interface UpstashRedisConfig {
  url: string;
  token: string;
  keyPrefix?: string;
}

/**
 * Upstash Redis adapter optimized for serverless environments
 * Uses HTTP-based Redis client for better compatibility with edge functions
 */
export class UpstashRedisAdapter implements IAdapter {
  private baseUrl: string;
  private token: string;
  private keyPrefix: string;

  constructor(config: UpstashRedisConfig) {
    this.baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
    this.token = config.token;
    this.keyPrefix = config.keyPrefix || 'pnp-ws:';
  }

  private async request(command: string[]): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Upstash Redis request failed: ${response.statusText}`);
    }

    const data = await response.json() as { result: unknown; error?: string };
    
    if (data.error) {
      throw new Error(`Upstash Redis error: ${data.error}`);
    }

    return data.result;
  }

  private async pipeline(commands: string[][]): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      throw new Error(`Upstash Redis pipeline request failed: ${response.statusText}`);
    }

    const data = await response.json() as Array<{ result: unknown; error?: string }>;
    
    return data.map(item => {
      if (item.error) {
        throw new Error(`Upstash Redis error: ${item.error}`);
      }
      return item.result;
    });
  }

  private getKey(type: string, id: string): string {
    return `${this.keyPrefix}${type}:${id}`;
  }

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
    
    await this.pipeline([
      ['HSET', key, ...flatData],
      ['EXPIRE', key, '86400'], // 24 hours
      ['SADD', this.getKey('sessions', 'active'), sessionId],
    ]);
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const key = this.getKey('session', sessionId);
    const data = await this.request(['HGETALL', key]) as Record<string, string>;
    
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
    await this.pipeline([
      ['DEL', key],
      ['SREM', this.getKey('sessions', 'active'), sessionId],
    ]);
  }

  async getAllSessions(): Promise<SessionMetadata[]> {
    const sessionIds = await this.request(['SMEMBERS', this.getKey('sessions', 'active')]) as string[];
    const sessions: SessionMetadata[] = [];
    
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      } else {
        // Cleanup stale session ID
        await this.request(['SREM', this.getKey('sessions', 'active'), sessionId]);
      }
    }
    
    return sessions;
  }

  async updateLastSeen(sessionId: string): Promise<void> {
    const key = this.getKey('session', sessionId);
    await this.pipeline([
      ['HSET', key, 'lastSeenAt', new Date().toISOString()],
      ['EXPIRE', key, '86400'], // Refresh TTL
    ]);
  }

  async indexDocument(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const docKey = this.getKey('doc', id);
    const docData = {
      content,
      indexedAt: new Date().toISOString(),
      ...(metadata && { metadata: JSON.stringify(metadata) }),
    };

    // Build indexes
    const ngrams = buildNGrams(content, 3);
    const edgegrams = buildEdgeGrams(content, 2, 10);

    // Prepare pipeline commands
    const commands: string[][] = [
      ['HSET', docKey, ...Object.entries(docData).flat()],
      ['SADD', this.getKey('docs', 'all'), id],
    ];

    // Add n-gram indexes
    for (const ngram of ngrams) {
      const ngramKey = this.getKey('ngram', ngram);
      commands.push(['SADD', ngramKey, id]);
      commands.push(['EXPIRE', ngramKey, '604800']); // 7 days
    }

    // Add edge-gram indexes
    for (const edgegram of edgegrams) {
      const edgegramKey = this.getKey('edgegram', edgegram);
      commands.push(['SADD', edgegramKey, id]);
      commands.push(['EXPIRE', edgegramKey, '604800']); // 7 days
    }

    await this.pipeline(commands);
  }

  async removeDocument(id: string): Promise<void> {
    // Get all index keys (simplified approach)
    const ngramKeys = await this.request(['KEYS', this.getKey('ngram', '*')]) as string[];
    const edgegramKeys = await this.request(['KEYS', this.getKey('edgegram', '*')]) as string[];
    
    const commands: string[][] = [
      ['DEL', this.getKey('doc', id)],
      ['SREM', this.getKey('docs', 'all'), id],
    ];

    // Remove from all indexes
    for (const key of [...ngramKeys, ...edgegramKeys]) {
      commands.push(['SREM', key, id]);
    }

    await this.pipeline(commands);
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const searchTerms = query.query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) {
      return {
        query: query.query,
        results: [],
        total: 0,
        took: Date.now() - startTime,
        hasMore: false,
      };
    }

    // Collect matching document IDs with scores
    const documentScores = new Map<string, number>();

    for (const term of searchTerms) {
      const termNgrams = buildNGrams(term, 3);
      const termEdgegrams = buildEdgeGrams(term, 2, 10);

      // Get matches from n-gram indexes
      for (const ngram of termNgrams) {
        const ngramKey = this.getKey('ngram', ngram);
        const matchingDocs = await this.request(['SMEMBERS', ngramKey]) as string[];
        
        for (const docId of matchingDocs) {
          documentScores.set(docId, (documentScores.get(docId) || 0) + 1);
        }
      }

      // Get matches from edge-gram indexes
      for (const edgegram of termEdgegrams) {
        const edgegramKey = this.getKey('edgegram', edgegram);
        const matchingDocs = await this.request(['SMEMBERS', edgegramKey]) as string[];
        
        for (const docId of matchingDocs) {
          const boost = edgegram.length / 10;
          documentScores.set(docId, (documentScores.get(docId) || 0) + boost);
        }
      }
    }

    // Convert to results array
    const allResults: SearchResult[] = [];
    
    for (const [docId, score] of documentScores.entries()) {
      const docKey = this.getKey('doc', docId);
      const docData = await this.request(['HGETALL', docKey]) as Record<string, string>;
      
      if (docData && docData.content) {
        const highlights = generateHighlights(docData.content, searchTerms);
        
        const data: Record<string, unknown> = { content: docData.content };
        if (docData.metadata) {
          try {
            Object.assign(data, JSON.parse(docData.metadata));
          } catch {
            // Ignore invalid JSON metadata
          }
        }
        
        allResults.push({
          id: docId,
          score,
          data,
          highlights,
        });
      }
    }

    // Sort by score (descending)
    allResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    const paginatedResults = allResults.slice(offset, offset + limit);

    return {
      query: query.query,
      results: paginatedResults,
      total: allResults.length,
      took: Date.now() - startTime,
      hasMore: offset + limit < allResults.length,
    };
  }

  async cleanup(): Promise<void> {
    const sessionIds = await this.request(['SMEMBERS', this.getKey('sessions', 'active')]) as string[];
    
    for (const sessionId of sessionIds) {
      const key = this.getKey('session', sessionId);
      const exists = await this.request(['EXISTS', key]) as number;
      
      if (!exists) {
        await this.request(['SREM', this.getKey('sessions', 'active'), sessionId]);
      }
    }
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }
}
