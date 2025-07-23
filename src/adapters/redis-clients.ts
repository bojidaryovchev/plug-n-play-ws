import type { Redis } from 'ioredis';

// Unified Redis interface for both ioredis and Upstash Redis

export interface UnifiedRedisInterface {
  // Basic operations
  hset(key: string, field: string, value: string): Promise<void>;
  hset(key: string, ...args: string[]): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;

  // Set operations
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;

  // Pipeline operations
  pipeline(commands: Array<[string, ...string[]]>): Promise<unknown[]>;

  // Key operations
  keys(pattern: string): Promise<string[]>;

  // Connection
  disconnect(): Promise<void>;
}

/**
 * Adapter for ioredis (regular Redis)
 */
export class IoRedisAdapter implements UnifiedRedisInterface {
  constructor(private redis: Redis) {}

  async hset(key: string, ...args: string[]): Promise<void> {
    if (args.length === 2 && args[0] && args[1]) {
      await this.redis.hset(key, args[0], args[1]);
    } else {
      await this.redis.hset(key, ...args);
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async sadd(key: string, member: string): Promise<void> {
    await this.redis.sadd(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async srem(key: string, member: string): Promise<void> {
    await this.redis.srem(key, member);
  }

  async pipeline(commands: Array<[string, ...string[]]>): Promise<unknown[]> {
    const pipeline = this.redis.pipeline();
    for (const [command, ...args] of commands) {
      // Use bracket notation to call pipeline methods dynamically
      // TypeScript doesn't know about dynamic method calls, so we use index access
      const pipelineMethod = (pipeline as unknown as Record<string, (...args: string[]) => typeof pipeline>)[command.toLowerCase()];
      if (pipelineMethod) {
        pipelineMethod.call(pipeline, ...args);
      }
    }
    const results = await pipeline.exec();
    
    // Check for errors in pipeline results
    const processedResults: unknown[] = [];
    if (results) {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) continue;
        
        const [error, value] = result;
        if (error) {
          let commandInfo = 'unknown';
          if (i < commands.length) {
            const cmd = commands[i];
            if (cmd && cmd.length > 0) {
              commandInfo = cmd[0];
            }
          }
          throw new Error(`Pipeline command ${i} (${commandInfo}) failed: ${error.message}`);
        }
        processedResults.push(value);
      }
    }
    
    return processedResults;
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Adapter for Upstash Redis (HTTP-based)
 */
export class UpstashRedisAdapter implements UnifiedRedisInterface {
  private baseUrl: string;
  private token: string;

  constructor(config: { url: string; token: string }) {
    this.baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
    this.token = config.token;
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

  async hset(key: string, ...args: string[]): Promise<void> {
    await this.request(['HSET', key, ...args]);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.request(['HGETALL', key]) as Record<string, string>;
  }

  async del(key: string): Promise<void> {
    await this.request(['DEL', key]);
  }

  async exists(key: string): Promise<number> {
    return await this.request(['EXISTS', key]) as number;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.request(['EXPIRE', key, seconds.toString()]);
  }

  async sadd(key: string, member: string): Promise<void> {
    await this.request(['SADD', key, member]);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.request(['SMEMBERS', key]) as string[];
  }

  async srem(key: string, member: string): Promise<void> {
    await this.request(['SREM', key, member]);
  }

  async pipeline(commands: Array<[string, ...string[]]>): Promise<unknown[]> {
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

  async keys(pattern: string): Promise<string[]> {
    return await this.request(['KEYS', pattern]) as string[];
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close for HTTP-based client
  }
}
