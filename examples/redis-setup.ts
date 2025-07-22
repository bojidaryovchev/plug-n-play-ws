// Example: Redis configuration and setup
import Redis from 'ioredis';
import { 
  PlugNPlayWSServer,
  RedisSessionStorage,
  RedisSearchIndex 
} from '@plugnplay/websockets';

// Create Redis instance
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null
});

// Alternative: Redis Cluster
// const redis = new Redis.Cluster([
//   { host: 'localhost', port: 7000 },
//   { host: 'localhost', port: 7001 },
//   { host: 'localhost', port: 7002 }
// ]);

// Create Redis-based session storage
const sessionStorage = new RedisSessionStorage({
  redis,
  keyPrefix: 'ws:session:',
  serializer: {
    serialize: (session) => JSON.stringify(session),
    deserialize: (data) => JSON.parse(data)
  }
});

// Create Redis-based search index
const searchIndex = new RedisSearchIndex({
  redis,
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
    title: 'Introduction to WebSockets',
    content: 'WebSockets provide full-duplex communication channels over a single TCP connection',
    tags: ['websockets', 'tutorial', 'networking'],
    description: 'Learn the basics of WebSocket technology',
    category: 'tutorial'
  },
  {
    id: '2',
    title: 'Real-time Chat Application',
    content: 'Build a scalable chat application using WebSockets and Redis',
    tags: ['chat', 'realtime', 'redis', 'websockets'],
    description: 'Step-by-step guide to building chat apps',
    category: 'project'
  },
  {
    id: '3',
    title: 'WebSocket Security Best Practices',
    content: 'Learn how to secure your WebSocket applications against common vulnerabilities',
    tags: ['security', 'websockets', 'best-practices'],
    description: 'Security guidelines for WebSocket development',
    category: 'security'
  }
];

// Initialize search index with sample data
async function initializeSearchIndex() {
  console.log('Initializing search index...');
  
  for (const item of sampleData) {
    await searchIndex.add(item.id, item);
  }
  
  console.log('Search index initialized with sample data');
}

// Create WebSocket server with Redis storage
const wsServer = new PlugNPlayWSServer({
  port: 8080,
  sessionStorage,
  searchIndex,
  heartbeatInterval: 30000,
  sessionTimeout: 600000, // 10 minutes
  
  onConnect: async (session) => {
    console.log(`Client connected: ${session.id}`);
    
    // Store additional session metadata in Redis
    await wsServer.updateSessionMetadata(session.id, {
      connectedAt: Date.now(),
      userAgent: 'WebSocket Client',
      ipAddress: '127.0.0.1' // In real app, get from request
    });
    
    // Send welcome message with search suggestions
    await wsServer.sendToSession(session.id, {
      type: 'welcome',
      message: 'Welcome! Try searching for "websockets", "chat", or "security"',
      suggestions: ['websockets tutorial', 'chat application', 'security best practices']
    });
  },
  
  onMessage: async (session, message) => {
    console.log(`Message from ${session.id}:`, message.data);
    
    // Update session activity metadata
    await wsServer.updateSessionMetadata(session.id, {
      lastMessageAt: Date.now(),
      messageCount: (session.metadata.messageCount || 0) + 1
    });
  },
  
  onDisconnect: async (session) => {
    console.log(`Client disconnected: ${session.id}`);
    
    // Log session statistics
    const finalSession = await sessionStorage.get(session.id);
    if (finalSession) {
      const duration = Date.now() - (finalSession.metadata.connectedAt || 0);
      console.log(`Session duration: ${duration}ms, Messages: ${finalSession.metadata.messageCount || 0}`);
    }
  },
  
  onError: (error, session) => {
    console.error('WebSocket error:', error);
    if (session) {
      console.error('Session:', session.id);
    }
  }
});

// Custom message handlers
wsServer.onMessage('room_join', async (data: { room: string }, session) => {
  const { room } = data;
  
  // Update session with room information
  await wsServer.updateSessionMetadata(session.id, {
    currentRoom: room,
    joinedRoomAt: Date.now()
  });
  
  // Notify other users in the room
  const activeSessions = await sessionStorage.getActiveSessions();
  const roomMembers = activeSessions.filter(s => s.metadata.currentRoom === room);
  
  for (const member of roomMembers) {
    if (member.id !== session.id) {
      await wsServer.sendToSession(member.id, {
        type: 'user_joined_room',
        room,
        userId: session.id,
        timestamp: Date.now()
      });
    }
  }
  
  // Send room member list to the joining user
  await wsServer.sendToSession(session.id, {
    type: 'room_members',
    room,
    members: roomMembers.map(m => ({ id: m.id, joinedAt: m.metadata.joinedRoomAt }))
  });
});

wsServer.onMessage('room_message', async (data: { room: string; message: string }, session) => {
  const { room, message } = data;
  
  // Broadcast to all users in the room
  const activeSessions = await sessionStorage.getActiveSessions();
  const roomMembers = activeSessions.filter(s => s.metadata.currentRoom === room);
  
  const broadcastMessage = {
    type: 'room_message',
    room,
    message,
    userId: session.id,
    timestamp: Date.now()
  };
  
  for (const member of roomMembers) {
    await wsServer.sendToSession(member.id, broadcastMessage);
  }
});

// Monitor Redis connection
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down WebSocket server...');
  
  try {
    // Close WebSocket server
    await wsServer.close();
    
    // Close Redis connection
    await redis.quit();
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Main function
async function main() {
  try {
    // Initialize search index
    await initializeSearchIndex();
    
    // Start WebSocket server
    await wsServer.initialize();
    
    console.log('Redis WebSocket server is running on port 8080');
    console.log('Redis connection established');
    
    // Setup signal handlers
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Health check endpoint data
setInterval(async () => {
  const stats = {
    activeConnections: await wsServer.getActiveSessionCount(),
    redisConnected: redis.status === 'ready',
    timestamp: Date.now()
  };
  
  console.log('Server stats:', stats);
}, 60000); // Log stats every minute

// Run the server
if (require.main === module) {
  main();
}

export {
  wsServer,
  sessionStorage,
  searchIndex,
  redis
};
