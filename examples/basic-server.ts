// Example: Basic WebSocket server setup
import { 
  PlugNPlayWSServer, 
  InMemorySessionStorage, 
  InMemorySearchIndex 
} from '@plugnplay/websockets';

// Create storage and search index
const sessionStorage = new InMemorySessionStorage();
const searchIndex = new InMemorySearchIndex({
  searchFields: ['title', 'content', 'tags'],
  ngramSize: 3
});

// Add some sample data to search index
await searchIndex.add('1', {
  title: 'Getting Started with WebSockets',
  content: 'Learn how to build real-time applications',
  tags: ['websockets', 'tutorial', 'javascript']
});

await searchIndex.add('2', {
  title: 'Advanced WebSocket Patterns',
  content: 'Explore advanced techniques for WebSocket development',
  tags: ['websockets', 'advanced', 'patterns']
});

// Create WebSocket server
const wsServer = new PlugNPlayWSServer({
  port: 8080,
  sessionStorage,
  searchIndex,
  heartbeatInterval: 30000,
  sessionTimeout: 300000,
  
  onConnect: async (session) => {
    console.log(`Client connected: ${session.id}`);
    
    // Send welcome message
    await wsServer.sendToSession(session.id, {
      type: 'welcome',
      message: 'Welcome to the WebSocket server!'
    });
  },
  
  onDisconnect: async (session) => {
    console.log(`Client disconnected: ${session.id}`);
  },
  
  onMessage: async (session, message) => {
    console.log(`Message from ${session.id}:`, message.data);
    
    // Echo the message back
    await wsServer.sendToSession(session.id, {
      type: 'echo',
      originalMessage: message.data,
      timestamp: Date.now()
    });
  },
  
  onError: (error, session) => {
    console.error('WebSocket error:', error, session?.id);
  }
});

// Custom message handlers
wsServer.onMessage('chat', async (data: { message: string; user: string }, session) => {
  // Broadcast chat message to all connected clients
  await wsServer.broadcast({
    type: 'chat',
    user: data.user,
    message: data.message,
    timestamp: Date.now(),
    sessionId: session.id
  });
});

wsServer.onMessage('typing', async (data: { isTyping: boolean; user: string }, session) => {
  // Broadcast typing indicator (excluding sender)
  const activeSessions = await sessionStorage.getActiveSessions();
  
  for (const activeSession of activeSessions) {
    if (activeSession.id !== session.id) {
      await wsServer.sendToSession(activeSession.id, {
        type: 'typing',
        user: data.user,
        isTyping: data.isTyping
      });
    }
  }
});

// Start the server
await wsServer.initialize();

console.log('WebSocket server is running on port 8080');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down WebSocket server...');
  await wsServer.close();
  process.exit(0);
});
