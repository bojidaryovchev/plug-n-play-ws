import type { Redis } from 'ioredis';
import { Session, SessionStorage } from '../types';

export interface RedisSessionStorageConfig {
  redis: Redis;
  keyPrefix?: string;
  serializer?: {
    serialize: (session: Session) => string;
    deserialize: (data: string) => Session;
  };
}

export class RedisSessionStorage implements SessionStorage {
  private redis: Redis;
  private keyPrefix: string;
  private serializer: {
    serialize: (session: Session) => string;
    deserialize: (data: string) => Session;
  };

  constructor(config: RedisSessionStorageConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'ws:session:';
    this.serializer = config.serializer || {
      serialize: (session: Session) => JSON.stringify(session),
      deserialize: (data: string) => JSON.parse(data),
    };
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  async set(sessionId: string, session: Session): Promise<void> {
    const key = this.getKey(sessionId);
    const serialized = this.serializer.serialize(session);
    await this.redis.set(key, serialized);
    
    // Add to active sessions set if active
    if (session.isActive) {
      await this.redis.sadd(`${this.keyPrefix}active`, sessionId);
    } else {
      await this.redis.srem(`${this.keyPrefix}active`, sessionId);
    }
  }

  async get(sessionId: string): Promise<Session | null> {
    const key = this.getKey(sessionId);
    const data = await this.redis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return this.serializer.deserialize(data);
    } catch (error) {
      console.error('Failed to deserialize session:', error);
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await Promise.all([
      this.redis.del(key),
      this.redis.srem(`${this.keyPrefix}active`, sessionId),
    ]);
  }

  async getActiveSessions(): Promise<Session[]> {
    const activeSessionIds = await this.redis.smembers(`${this.keyPrefix}active`);
    const sessions: Session[] = [];

    for (const sessionId of activeSessionIds) {
      const session = await this.get(sessionId);
      if (session && session.isActive) {
        sessions.push(session);
      } else {
        // Clean up stale references
        await this.redis.srem(`${this.keyPrefix}active`, sessionId);
      }
    }

    return sessions;
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      await this.set(sessionId, session);
    }
  }

  async cleanup(maxAge: number): Promise<void> {
    const now = Date.now();
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    const toDelete: string[] = [];

    for (const key of keys) {
      if (key.includes('active')) continue; // Skip the active set
      
      const data = await this.redis.get(key);
      if (data) {
        try {
          const session = this.serializer.deserialize(data);
          if (now - session.lastActivity > maxAge) {
            toDelete.push(key);
            // Also remove from active set
            const sessionId = key.replace(this.keyPrefix, '');
            await this.redis.srem(`${this.keyPrefix}active`, sessionId);
          }
        } catch (error) {
          // If we can't deserialize, consider it stale
          toDelete.push(key);
        }
      }
    }

    if (toDelete.length > 0) {
      await this.redis.del(...toDelete);
    }
  }

  // Additional utility methods
  async getSessionCount(): Promise<number> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    return keys.filter((key: string) => !key.includes('active')).length;
  }

  async getActiveSessionCount(): Promise<number> {
    return await this.redis.scard(`${this.keyPrefix}active`);
  }

  async clear(): Promise<void> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Close Redis connection
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
