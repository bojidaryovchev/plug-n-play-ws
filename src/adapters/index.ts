// Adapters export index

export { MemoryAdapter } from './memory';
export { RedisAdapter, type RedisAdapterConfig } from './redis';
export { UpstashRedisAdapter, type UpstashRedisConfig } from './upstash-redis';
export type { IAdapter } from '../types';

// Export shared utilities
export { buildNGrams, buildEdgeGrams, generateHighlights } from '../utils/text-processing';
