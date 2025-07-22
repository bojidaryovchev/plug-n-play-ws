// Redis adapter implementation for production use

import Redis from 'ioredis';
import {
  IAdapter,
  SessionMetadata,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../types';
import { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';

export interface RedisAdapterConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  keyPrefix?: string;
}

/**
 * Redis adapter for production use with persistence and scalability
 */
export class RedisAdapter implements IAdapter {
  private redis: Redis;
  private keyPrefix: string;

  constructor(config: RedisAdapterConfig = {}) {
    this.keyPrefix = config.keyPrefix || 'pnp-ws:';

    if (config.url) {
      this.redis = new Redis(config.url);
    } else {
      const redisConfig = {
        host: config.host || 'localhost',
        port: config.port || 6379,
        db: config.db || 0,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        ...(config.password && { password: config.password }),
      };

      this.redis = new Redis(redisConfig);
    }
  }

  private getKey(type: string, id: string): string {
    return `${this.keyPrefix}${type}:${id}`;
  }

  async setSession(
    sessionId: string,
    metadata: SessionMetadata
  ): Promise<void> {
    const key = this.getKey('session', sessionId);
    const data = {
      ...metadata,
      connectedAt: metadata.connectedAt.toISOString(),
      lastSeenAt: metadata.lastSeenAt.toISOString(),
    };

    await this.redis.hset(key, data);
    await this.redis.expire(key, 24 * 60 * 60); // 24 hours TTL

    // Add to sessions set for getAllSessions
    await this.redis.sadd(this.getKey('sessions', 'active'), sessionId);
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const key = this.getKey('session', sessionId);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0 || !data.id) {
      return null;
    }

    const metadata: SessionMetadata = {
      id: data.id,
      connectedAt: data.connectedAt ? new Date(data.connectedAt) : new Date(),
      lastSeenAt: data.lastSeenAt ? new Date(data.lastSeenAt) : new Date(),
    };

    // Add optional fields only if they exist
    if (data.userId) metadata.userId = data.userId;
    if (data.tabId) metadata.tabId = data.tabId;
    if (data.userAgent) metadata.userAgent = data.userAgent;
    if (data.ip) metadata.ip = data.ip;
    if (data.metadata) metadata.metadata = JSON.parse(data.metadata);

    return metadata;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = this.getKey('session', sessionId);
    await this.redis.del(key);
    await this.redis.srem(this.getKey('sessions', 'active'), sessionId);
  }

  async getAllSessions(): Promise<SessionMetadata[]> {
    const sessionIds = await this.redis.smembers(
      this.getKey('sessions', 'active')
    );
    const sessions: SessionMetadata[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      } else {
        // Cleanup stale session ID from set
        await this.redis.srem(this.getKey('sessions', 'active'), sessionId);
      }
    }

    return sessions;
  }

  async updateLastSeen(sessionId: string): Promise<void> {
    const key = this.getKey('session', sessionId);
    await this.redis.hset(key, 'lastSeenAt', new Date().toISOString());
    await this.redis.expire(key, 24 * 60 * 60); // Refresh TTL
  }

  async indexDocument(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Store document
    const docKey = this.getKey('doc', id);
    await this.redis.hset(docKey, {
      content,
      ...(metadata && { metadata: JSON.stringify(metadata) }),
      indexedAt: new Date().toISOString(),
    });

    // Remove old index entries for this document
    await this.removeDocumentFromIndexes(id);

    // Build and index n-grams and edge-grams
    const ngrams = buildNGrams(content, 3);
    const edgegrams = buildEdgeGrams(content, 2, 10);

    // Use Redis pipeline for batch operations
    const pipeline = this.redis.pipeline();

    // Index n-grams
    for (const ngram of ngrams) {
      const ngramKey = this.getKey('ngram', ngram);
      pipeline.sadd(ngramKey, id);
      pipeline.expire(ngramKey, 7 * 24 * 60 * 60); // 7 days TTL
    }

    // Index edge-grams
    for (const edgegram of edgegrams) {
      const edgegramKey = this.getKey('edgegram', edgegram);
      pipeline.sadd(edgegramKey, id);
      pipeline.expire(edgegramKey, 7 * 24 * 60 * 60); // 7 days TTL
    }

    // Add to documents set
    pipeline.sadd(this.getKey('docs', 'all'), id);

    await pipeline.exec();
  }

  async removeDocument(id: string): Promise<void> {
    await this.removeDocumentFromIndexes(id);

    // Remove document data
    const docKey = this.getKey('doc', id);
    await this.redis.del(docKey);
    await this.redis.srem(this.getKey('docs', 'all'), id);
  }

  private async removeDocumentFromIndexes(id: string): Promise<void> {
    // This is a simplified cleanup - in production, you might want to
    // track which terms each document is indexed under for efficient cleanup
    const allNgramKeys = await this.redis.keys(this.getKey('ngram', '*'));
    const allEdgegramKeys = await this.redis.keys(this.getKey('edgegram', '*'));

    const pipeline = this.redis.pipeline();

    for (const key of [...allNgramKeys, ...allEdgegramKeys]) {
      pipeline.srem(key, id);
    }

    await pipeline.exec();
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const searchTerms = query.query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 0);

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
        const matchingDocs = await this.redis.smembers(ngramKey);

        for (const docId of matchingDocs) {
          documentScores.set(docId, (documentScores.get(docId) || 0) + 1);
        }
      }

      // Get matches from edge-gram indexes (with higher weight)
      for (const edgegram of termEdgegrams) {
        const edgegramKey = this.getKey('edgegram', edgegram);
        const matchingDocs = await this.redis.smembers(edgegramKey);

        for (const docId of matchingDocs) {
          const boost = edgegram.length / 10; // Longer matches get higher score
          documentScores.set(docId, (documentScores.get(docId) || 0) + boost);
        }
      }
    }

    // Convert to results array
    const allResults: SearchResult[] = [];

    for (const [docId, score] of documentScores.entries()) {
      const docKey = this.getKey('doc', docId);
      const docData = await this.redis.hgetall(docKey);

      if (docData && docData.content) {
        // Generate highlights
        const highlights = generateHighlights(
          docData.content,
          searchTerms
        );

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
    // Clean up expired sessions
    const sessionIds = await this.redis.smembers(
      this.getKey('sessions', 'active')
    );

    for (const sessionId of sessionIds) {
      const key = this.getKey('session', sessionId);
      const exists = await this.redis.exists(key);

      if (!exists) {
        await this.redis.srem(this.getKey('sessions', 'active'), sessionId);
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
