// Basic server ↔ client echo example with modern features

import { PlugNPlayServer, PlugNPlayClient } from '../src';

// Custom event types for this example
interface EchoEvents extends Record<string, unknown> {
  echo: { message: string; timestamp: number };
  'echo-response': { original: string; echo: string; serverTime: number };
  'user-count': { count: number };
}

async function runEchoExample() {
  console.log('🚀 Starting Enhanced Echo Example...\n');

  // 1. Create and start server with modern configuration
  const server = new PlugNPlayServer<EchoEvents>({
    port: 3001,
    maxConnections: 10, // Limit concurrent connections
    heartbeatInterval: 5000, // Send heartbeat every 5 seconds
    heartbeatTimeout: 10000, // Timeout after 10 seconds
    cors: {
      origin: true,
      credentials: true,
    },
    logger: {
      debug: (msg, meta) => console.log(`[SERVER DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[SERVER INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[SERVER WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[SERVER ERROR] ${msg}`, meta || ''),
    },
  });

  // Track connected users
  let userCount = 0;

  // Handle new connections
  server.on('connect', () => {
    userCount++;
    console.log(`👤 User connected (total: ${userCount})`);
    server.broadcast('user-count', { count: userCount });
  });

  // Handle disconnections
  server.on('disconnect', () => {
    userCount--;
    console.log(`👋 User disconnected (total: ${userCount})`);
    server.broadcast('user-count', { count: userCount });
  });

  // Handle echo messages
  server.on('echo', (data) => {
    console.log(`📨 Server received echo: "${data.message}"`);
    
    // Echo back with server timestamp
    server.broadcast('echo-response', {
      original: data.message,
      echo: `Echo: ${data.message}`,
      serverTime: Date.now(),
    });
  });

  // Start server
  await server.listen();
  console.log('✅ Server started on port 3001\n');

  // 2. Create client with enhanced configuration
  const client = new PlugNPlayClient<EchoEvents>({
    url: 'http://localhost:3001',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 5000,
    logger: {
      debug: (msg, meta) => console.log(`[CLIENT DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[CLIENT INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[CLIENT WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[CLIENT ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle connection events (using type assertions for demo)
  client.on('connect', (data: unknown) => {
    const connectData = data as { sessionId: string };
    console.log(`✅ Client connected with session: ${connectData.sessionId}`);
  });

  client.on('disconnect', (data: unknown) => {
    const disconnectData = data as { reason: string };
    console.log(`⚠️ Client disconnected: ${disconnectData.reason}`);
  });

  client.on('error', (error: unknown) => {
    const err = error as Error;
    console.error(`❌ Client error: ${err.message}`);
  });

  // Handle echo responses
  client.on('echo-response', (data) => {
    console.log(`📬 Client received: "${data.echo}" (server time: ${data.serverTime})`);
  });

  // Handle user count updates
  client.on('user-count', (data) => {
    console.log(`👥 Connected users: ${data.count}`);
  });

  // Connect client
  await client.connect();
  console.log('✅ Client connected\n');

  // 3. Send some echo messages
  const messages = [
    'Hello World!',
    'TypeScript is awesome',
    'WebSockets are real-time',
    'This is a plug-and-play example',
  ];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`📤 Sending: "${message}"`);
    
    client.send('echo', {
      message,
      timestamp: Date.now(),
    });
    
    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 4. Wait a bit then cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n🧹 Cleaning up...');
  client.disconnect();
  await server.close();
  
  console.log('✅ Echo example complete!');
}

// Run the example
runEchoExample().catch(console.error);
