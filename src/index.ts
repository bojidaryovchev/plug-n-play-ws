// Main export index

export * from './types';
export * from './server';
export * from './client';
export * from './adapters';
export * from './utils/text-processing';

// Default exports for convenience
export { PlugNPlayServer } from './server';
export { PlugNPlayClient } from './client';

// Memory adapter (for development/testing)
export { MemoryAdapter } from './adapters';

// Recommended Redis adapter and factories
export { 
  UnifiedRedisAdapter,
  createRedisAdapter,
  createUpstashRedisAdapter,
  createRedisAdapterFromEnv
} from './adapters';
