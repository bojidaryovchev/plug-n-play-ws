// Basic server ↔ client echo example

import { PlugNPlayServer, PlugNPlayClient } from '../src';

// Custom event types for this example
interface EchoEvents extends Record<string, unknown> {
  echo: { message: string; timestamp: number };
  'echo-response': { original: string; echo: string; serverTime: number };
}

async function runEchoExample() {
  console.log('🚀 Starting Echo Example...\n');

  // 1. Create and start server
  const server = new PlugNPlayServer<EchoEvents>({
    port: 3001,
    logger: {
      debug: (msg, meta) => console.log(`[SERVER DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[SERVER INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[SERVER WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[SERVER ERROR] ${msg}`, meta || ''),
    },
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

  // 2. Create client
  const client = new PlugNPlayClient<EchoEvents>({
    url: 'http://localhost:3001',
    logger: {
      debug: (msg, meta) => console.log(`[CLIENT DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[CLIENT INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[CLIENT WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[CLIENT ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle echo responses
  client.on('echo-response', (data) => {
    console.log(`📬 Client received: "${data.echo}" (server time: ${data.serverTime})`);
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
