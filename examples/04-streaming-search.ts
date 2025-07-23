// Advanced streaming search example with real-time results

import { PlugNPlayServer, PlugNPlayClient, createRedisAdapter, SearchResult } from '../src';

// Custom event types for streaming search
interface StreamingSearchEvents extends Record<string, unknown> {
  'index-document': { id: string; content: string; metadata?: Record<string, unknown> };
  'search-streaming': { query: string; limit?: number };
  'document-indexed': { id: string; success: boolean };
}

async function runStreamingSearchExample() {
  console.log('🔍 Starting Streaming Search Example...\n');

  // 1. Create Redis adapter with optimized search config
  const redisAdapter = createRedisAdapter({
    host: 'localhost',
    port: 6379,
    keyPrefix: 'streaming:',
    searchConfig: {
      ngramSize: 3,
      minEdgegram: 2,
      maxEdgegram: 4,
      exactMatchBoost: 150,
      ngramWeight: 0.6,
      edgegramWeight: 1.2,
      minScore: 0.05,
    },
  });

  // 2. Create server with streaming capabilities
  const server = new PlugNPlayServer<StreamingSearchEvents>({
    port: 3003,
    adapter: redisAdapter,
    maxConnections: 50,
    heartbeatInterval: 10000,
    logger: {
      debug: (msg, meta) => console.log(`[SERVER DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[SERVER INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[SERVER WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[SERVER ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle document indexing
  server.on('index-document', async (data) => {
    try {
      console.log(`📝 Indexing document: ${data.id}`);
      await server.indexContent(data.id, data.content, data.metadata);
      
      server.broadcast('document-indexed', {
        id: data.id,
        success: true,
      });
      
      console.log(`✅ Document indexed: ${data.id}`);
    } catch (error) {
      console.error(`❌ Failed to index document ${data.id}:`, error);
      server.broadcast('document-indexed', {
        id: data.id,
        success: false,
      });
    }
  });

  // Handle streaming search queries
  server.on('search-streaming', async (data) => {
    try {
      console.log(`🔍 Streaming search for: "${data.query}"`);
      
      // Perform streaming search - results are sent as they come in
      await server.search({
        query: data.query,
        limit: data.limit || 20,
        streaming: true, // Enable streaming mode
      });
      
      console.log(`📊 Streaming search completed for: "${data.query}"`);
    } catch (error) {
      console.error(`❌ Streaming search failed:`, error);
    }
  });

  // Start server
  await server.listen();
  console.log('✅ Server started on port 3003\n');

  // 3. Create client with streaming support
  const client = new PlugNPlayClient<StreamingSearchEvents>({
    url: 'http://localhost:3003',
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    logger: {
      debug: (msg, meta) => console.log(`[CLIENT DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[CLIENT INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[CLIENT WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[CLIENT ERROR] ${msg}`, meta || ''),
    },
  });

  // Track streaming results
  const streamingResults: SearchResult[] = [];
  let currentQuery = '';

  // Handle streaming search results
  client.on('search-stream', (data: unknown) => {
    const streamData = data as { chunk: SearchResult; isLast: boolean };
    
    if (streamingResults.length === 0) {
      console.log(`\n📋 Streaming results for "${currentQuery}":`);
    }
    
    streamingResults.push(streamData.chunk);
    console.log(`   ${streamingResults.length}. ${streamData.chunk.id} (score: ${streamData.chunk.score.toFixed(3)})`);
    
    if (streamData.chunk.highlights && streamData.chunk.highlights.length > 0) {
      console.log(`      💡 ${streamData.chunk.highlights[0]}`);
    }
    
    if (streamData.isLast) {
      console.log(`✅ Streaming complete - Total results: ${streamingResults.length}\n`);
      streamingResults.length = 0; // Reset for next search
    }
  });

  // Handle document indexing status
  client.on('document-indexed', (data: unknown) => {
    const indexData = data as { id: string; success: boolean };
    const status = indexData.success ? '✅' : '❌';
    console.log(`${status} Document ${indexData.id} ${indexData.success ? 'indexed' : 'failed'}`);
  });

  // Connect client
  await client.connect();
  console.log('✅ Client connected\n');

  // 4. Index comprehensive dataset
  const techDocuments = [
    {
      id: 'typescript-basics',
      content: 'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. It adds optional static type definitions to JavaScript.',
      metadata: { category: 'programming', language: 'typescript', difficulty: 'beginner' },
    },
    {
      id: 'websocket-protocol',
      content: 'WebSocket is a communication protocol that provides full-duplex communication channels over a single TCP connection. It enables real-time data exchange between client and server.',
      metadata: { category: 'networking', protocol: 'websocket', type: 'real-time' },
    },
    {
      id: 'redis-overview',
      content: 'Redis is an open source, in-memory data structure store used as a database, cache, and message broker. It supports various data structures like strings, hashes, lists, sets.',
      metadata: { category: 'database', type: 'in-memory', persistence: 'optional' },
    },
    {
      id: 'socketio-features',
      content: 'Socket.IO enables real-time bidirectional event-based communication. It works on every platform, browser or device, focusing equally on reliability and speed.',
      metadata: { category: 'library', language: 'javascript', focus: 'real-time' },
    },
    {
      id: 'react-hooks',
      content: 'React Hooks let you use state and other React features without writing a class. They allow you to reuse stateful logic between components.',
      metadata: { category: 'frontend', framework: 'react', feature: 'hooks' },
    },
    {
      id: 'nodejs-runtime',
      content: 'Node.js is a JavaScript runtime built on Chrome V8 JavaScript engine. It uses an event-driven, non-blocking I/O model that makes it lightweight and efficient.',
      metadata: { category: 'runtime', language: 'javascript', architecture: 'event-driven' },
    },
    {
      id: 'docker-containers',
      content: 'Docker containers wrap a piece of software in a complete filesystem that contains everything needed to run: code, runtime, system tools, system libraries.',
      metadata: { category: 'devops', technology: 'containerization', deployment: 'docker' },
    },
    {
      id: 'api-design',
      content: 'RESTful API design principles include using HTTP methods correctly, proper status codes, consistent naming conventions, and stateless communication.',
      metadata: { category: 'architecture', type: 'rest-api', principles: 'design' },
    },
  ];

  console.log('📝 Indexing comprehensive dataset...\n');
  for (const doc of techDocuments) {
    client.send('index-document', doc);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Wait for indexing to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 5. Perform streaming searches with different patterns
  const streamingQueries = [
    'TypeScript programming language',
    'real-time communication',
    'JavaScript runtime engine',
    'in-memory database',
    'React hooks components',
    'event-driven architecture',
    'container deployment',
    'API design principles',
  ];

  console.log('\n🔍 Starting streaming searches...\n');
  
  for (const query of streamingQueries) {
    console.log(`🔎 Searching: "${query}"`);
    currentQuery = query;
    
    client.send('search-streaming', { query, limit: 15 });
    
    // Wait for streaming to complete before next search
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 6. Cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n🧹 Cleaning up...');
  client.disconnect();
  await server.close();
  await redisAdapter.disconnect();
  
  console.log('✅ Streaming search example complete!');
}

// Run the example
runStreamingSearchExample().catch((error) => {
  console.error('❌ Streaming search example failed:', error);
  process.exit(1);
});
