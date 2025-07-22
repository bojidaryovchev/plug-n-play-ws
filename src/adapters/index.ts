// Adapters export index

export { MemoryAdapter, type MemoryAdapterConfig } from './memory';

// Unified Redis adapter (recommended)
export { UnifiedRedisAdapter, type UnifiedRedisAdapterConfig } from './redis';
export { IoRedisAdapter, UpstashRedisAdapter as UpstashRedisClient } from './redis-clients';
export { BaseSearchAdapter, type SearchConfig, DEFAULT_SEARCH_CONFIG } from './base-search';

// Factory functions for easier adapter creation (recommended approach)
export { 
  createRedisAdapter, 
  createUpstashRedisAdapter, 
  createRedisAdapterFromEnv,
  type RedisAdapterConfig as FactoryRedisConfig,
  type UpstashRedisConfig as FactoryUpstashConfig
} from './redis-factory';

export type { IAdapter } from '../types';

// Export shared utilities
export { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';
