// Example: Simple WebSocket echo server with search
import { 
  PlugNPlayWSServer, 
  InMemorySessionStorage, 
  InMemorySearchIndex 
} from '@plugnplay/websockets';

async function createEchoServer() {
  // Set up storage and search
  const sessionStorage = new InMemorySessionStorage();
  const searchIndex = new InMemorySearchIndex({
    searchFields: ['message', 'user'],
    ngramSize: 3
  });

  // Create WebSocket server
  const server = new PlugNPlayWSServer({
    port: 8080,
    sessionStorage,
    searchIndex,
    
    onConnect: async (session) => {
      console.log(`✅ Client connected: ${session.id}`);
      
      await server.sendToSession(session.id, {
        type: 'welcome',
        message: 'Welcome to the echo server! Send any message and it will be echoed back.'
      });
    },
    
    onMessage: async (session, message) => {
      console.log(`📩 Message from ${session.id}:`, message.data);
      
      // Add message to search index
      await searchIndex.add(`${session.id}-${Date.now()}`, {
        message: JSON.stringify(message.data),
        user: session.id,
        timestamp: Date.now()
      });
      
      // Echo the message back
      await server.sendToSession(session.id, {
        type: 'echo',
        original: message.data,
        timestamp: Date.now(),
        sessionId: session.id
      });
    },
    
    onDisconnect: async (session) => {
      console.log(`❌ Client disconnected: ${session.id}`);
    }
  });

  // Start server
  await server.initialize();
  console.log('🚀 Echo server running on ws://localhost:8080/ws');
  
  return server;
}

if (require.main === module) {
  createEchoServer().catch(console.error);
}
