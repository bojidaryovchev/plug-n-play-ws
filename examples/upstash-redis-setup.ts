// Example: Using Upstash Redis with the WebSocket package
import { Redis } from '@upstash/redis';
import { 
  PlugNPlayWSServer,
  RedisSessionStorage,
  RedisSearchIndex 
} from '@plugnplay/websockets';

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Alternative: Using ioredis with Upstash (if you prefer the ioredis interface)
// import { Redis as IORedis } from 'ioredis';
// const redis = new IORedis(process.env.UPSTASH_REDIS_URL!);

// Create Redis-based session storage with Upstash
const sessionStorage = new RedisSessionStorage({
  redis: redis as any, // Type assertion needed for Upstash Redis
  keyPrefix: 'ws:session:',
  serializer: {
    serialize: (session) => JSON.stringify(session),
    deserialize: (data) => JSON.parse(data)
  }
});

// Create Redis-based search index with Upstash
const searchIndex = new RedisSearchIndex({
  redis: redis as any, // Type assertion needed for Upstash Redis
  keyPrefix: 'search:',
  ngramSize: 3,
  searchFields: ['title', 'content', 'tags', 'description'],
  caseSensitive: false,
  maxResults: 1000
});

// Sample data for search index
const sampleData = [
  {
    id: '1',
    title: 'Getting Started with Upstash',
    content: 'Upstash is a serverless Redis platform that works great with WebSockets',
    tags: ['upstash', 'redis', 'serverless', 'websockets'],
    description: 'Learn how to use Upstash Redis with WebSockets',
    category: 'tutorial'
  },
  {
    id: '2',
    title: 'Scaling WebSocket Applications',
    content: 'Use Upstash Redis to scale your WebSocket applications globally',
    tags: ['scaling', 'websockets', 'global', 'upstash'],
    description: 'Best practices for scaling WebSocket apps',
    category: 'guide'
  },
  {
    id: '3',
    title: 'Real-time Search with Redis',
    content: 'Implement fast real-time search using Redis and edge n-grams',
    tags: ['search', 'redis', 'realtime', 'ngrams'],
    description: 'Building search functionality with Redis',
    category: 'advanced'
  }
];

// Initialize search index with sample data
async function initializeSearchIndex() {
  console.log('🔄 Initializing Upstash Redis search index...');
  
  for (const item of sampleData) {
    await searchIndex.add(item.id, item);
    console.log(`✅ Added: ${item.title}`);
  }
  
  console.log('🎉 Search index initialized with sample data');
}

// Create WebSocket server with Upstash Redis
const wsServer = new PlugNPlayWSServer({
  port: 8080,
  sessionStorage,
  searchIndex,
  heartbeatInterval: 30000,
  sessionTimeout: 600000, // 10 minutes
  
  onConnect: async (session) => {
    console.log(`🔗 Client connected: ${session.id}`);
    
    // Store additional session metadata in Upstash Redis
    await wsServer.updateSessionMetadata(session.id, {
      connectedAt: Date.now(),
      userAgent: 'WebSocket Client',
      region: 'global', // Upstash advantage: global edge locations
      platform: 'upstash'
    });
    
    // Send welcome message
    await wsServer.sendToSession(session.id, {
      type: 'welcome',
      message: 'Connected to Upstash-powered WebSocket server!',
      features: [
        'Global Redis edge locations',
        'Serverless scaling',
        'Built-in search',
        'Session persistence'
      ]
    });
  },
  
  onMessage: async (session, message) => {
    console.log(`📨 Message from ${session.id}:`, message.data);
    
    // Update session activity in Upstash Redis
    await wsServer.updateSessionMetadata(session.id, {
      lastMessageAt: Date.now(),
      messageCount: (session.metadata.messageCount || 0) + 1
    });
    
    // Echo message back with Upstash info
    await wsServer.sendToSession(session.id, {
      type: 'echo',
      original: message.data,
      timestamp: Date.now(),
      poweredBy: 'Upstash Redis',
      sessionInfo: {
        totalMessages: session.metadata.messageCount + 1,
        connectedSince: session.metadata.connectedAt
      }
    });
  },
  
  onDisconnect: async (session) => {
    console.log(`❌ Client disconnected: ${session.id}`);
    
    // Log final session stats from Upstash
    const finalSession = await sessionStorage.get(session.id);
    if (finalSession) {
      const duration = Date.now() - (finalSession.metadata.connectedAt || 0);
      const messageCount = finalSession.metadata.messageCount || 0;
      
      console.log(`📊 Session stats: ${duration}ms duration, ${messageCount} messages`);
      console.log(`🌍 Powered by Upstash Redis global edge network`);
    }
  },
  
  onError: (error, session) => {
    console.error('❌ WebSocket error:', error);
    if (session) {
      console.error('Session:', session.id);
    }
  }
});

// Custom message handlers for Upstash-specific features
wsServer.onMessage('upstash_stats', async (data, session) => {
  try {
    // Get Redis stats (Upstash specific)
    const activeSessionCount = await wsServer.getActiveSessionCount();
    const searchIndexSize = await searchIndex.getDocumentCount();
    
    await wsServer.sendToSession(session.id, {
      type: 'upstash_stats_response',
      stats: {
        activeSessions: activeSessionCount,
        searchDocuments: searchIndexSize,
        redisProvider: 'Upstash',
        features: [
          'Global edge locations',
          'Automatic scaling',
          'Built-in monitoring',
          'Pay-per-request pricing'
        ]
      }
    });
  } catch (error) {
    console.error('Error getting Upstash stats:', error);
  }
});

wsServer.onMessage('test_search', async (data: { query: string }, session) => {
  try {
    const { query } = data;
    const results = await searchIndex.search(query, { limit: 10 });
    
    await wsServer.sendToSession(session.id, {
      type: 'search_results',
      query,
      results,
      total: results.length,
      poweredBy: 'Upstash Redis + Edge N-grams'
    });
  } catch (error) {
    console.error('Search error:', error);
    await wsServer.sendToSession(session.id, {
      type: 'error',
      message: 'Search failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check function for Upstash
async function healthCheck() {
  try {
    // Test Redis connection
    await redis.ping();
    console.log('✅ Upstash Redis connection healthy');
    
    // Test session storage
    const testSession = {
      id: 'health-check',
      connectionId: 'test',
      metadata: { test: true },
      lastActivity: Date.now(),
      isActive: true
    };
    
    await sessionStorage.set('health-check', testSession);
    const retrieved = await sessionStorage.get('health-check');
    await sessionStorage.delete('health-check');
    
    if (retrieved) {
      console.log('✅ Session storage working');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
}

// Main function
async function main() {
  try {
    console.log('🚀 Starting Upstash Redis WebSocket server...');
    
    // Health check
    const healthy = await healthCheck();
    if (!healthy) {
      throw new Error('Health check failed');
    }
    
    // Initialize search index
    await initializeSearchIndex();
    
    // Start WebSocket server
    await wsServer.initialize();
    
    console.log('🎉 Upstash Redis WebSocket server running on port 8080');
    console.log('🌍 Using Upstash Redis global edge network');
    console.log('📡 WebSocket endpoint: ws://localhost:8080/ws');
    
    // Log stats every minute
    setInterval(async () => {
      try {
        const stats = {
          activeConnections: await wsServer.getActiveSessionCount(),
          searchDocuments: await searchIndex.getDocumentCount(),
          timestamp: new Date().toISOString(),
          provider: 'Upstash Redis'
        };
        
        console.log('📊 Server stats:', stats);
      } catch (error) {
        console.error('Error getting stats:', error);
      }
    }, 60000);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('🛑 Shutting down Upstash WebSocket server...');
  
  try {
    await wsServer.close();
    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Setup signal handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Run if this is the main module
if (require.main === module) {
  main();
}

export {
  wsServer,
  sessionStorage,
  searchIndex,
  redis
};
