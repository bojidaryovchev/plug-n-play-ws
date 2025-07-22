// Factory functions for creating Redis adapters with the unified interface

import Redis from 'ioredis';
import { UnifiedRedisAdapter } from './redis';
import { IoRedisAdapter, UpstashRedisAdapter as UpstashRedisClient } from './redis-clients';
import type { SearchConfig } from './base-search';

export interface RedisAdapterConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  keyPrefix?: string;
  searchConfig?: Partial<SearchConfig>;
  ttl?: {
    session?: number;
    document?: number;
    index?: number;
  };
}

export interface UpstashRedisConfig {
  url: string;
  token: string;
  keyPrefix?: string;
  searchConfig?: Partial<SearchConfig>;
  ttl?: {
    session?: number;
    document?: number;
    index?: number;
  };
}

/**
 * Create a Redis adapter using ioredis (standard Redis)
 */
export function createRedisAdapter(config: RedisAdapterConfig): UnifiedRedisAdapter {
  let redis: Redis;

  if (config.url) {
    redis = new Redis(config.url);
  } else {
    const redisConfig: any = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      db: config.db || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    if (config.password) {
      redisConfig.password = config.password;
    }

    redis = new Redis(redisConfig);
  }

  const unifiedRedis = new IoRedisAdapter(redis);

  const adapterConfig: any = {
    redis: unifiedRedis,
  };

  if (config.keyPrefix) {
    adapterConfig.keyPrefix = config.keyPrefix;
  }

  if (config.searchConfig) {
    adapterConfig.searchConfig = config.searchConfig;
  }

  if (config.ttl) {
    adapterConfig.ttl = config.ttl;
  }

  return new UnifiedRedisAdapter(adapterConfig);
}

/**
 * Create an Upstash Redis adapter (HTTP-based Redis for serverless)
 */
export function createUpstashRedisAdapter(config: UpstashRedisConfig): UnifiedRedisAdapter {
  const upstashRedis = new UpstashRedisClient({
    url: config.url,
    token: config.token,
  });

  const adapterConfig: any = {
    redis: upstashRedis,
  };

  if (config.keyPrefix) {
    adapterConfig.keyPrefix = config.keyPrefix;
  }

  if (config.searchConfig) {
    adapterConfig.searchConfig = config.searchConfig;
  }

  if (config.ttl) {
    adapterConfig.ttl = config.ttl;
  }

  return new UnifiedRedisAdapter(adapterConfig);
}

/**
 * Helper to create adapter from environment variables
 * Supports both Redis and Upstash Redis based on available env vars
 */
export function createRedisAdapterFromEnv(
  keyPrefix?: string,
  searchConfig?: Partial<SearchConfig>
): UnifiedRedisAdapter {
  // Check for Upstash Redis first
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    const config: UpstashRedisConfig = {
      url: upstashUrl,
      token: upstashToken,
    };

    if (keyPrefix) {
      config.keyPrefix = keyPrefix;
    }

    if (searchConfig) {
      config.searchConfig = searchConfig;
    }

    return createUpstashRedisAdapter(config);
  }

  // Fall back to regular Redis
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const config: RedisAdapterConfig = {
      url: redisUrl,
    };

    if (keyPrefix) {
      config.keyPrefix = keyPrefix;
    }

    if (searchConfig) {
      config.searchConfig = searchConfig;
    }

    return createRedisAdapter(config);
  }

  // Use default Redis connection
  const config: RedisAdapterConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0'),
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }

  if (keyPrefix) {
    config.keyPrefix = keyPrefix;
  }

  if (searchConfig) {
    config.searchConfig = searchConfig;
  }

  return createRedisAdapter(config);
}
