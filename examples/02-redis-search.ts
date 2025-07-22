// Redis storage + search demo

import { PlugNPlayServer, PlugNPlayClient, RedisAdapter } from '../src';

// Custom event types for search
interface SearchEvents extends Record<string, unknown> {
  'index-document': { id: string; content: string; metadata?: Record<string, unknown> };
  'search-query': { query: string; limit?: number; streaming?: boolean };
  'document-indexed': { id: string; success: boolean };
  'search-results': { query: string; results: unknown[]; total: number; took: number };
}

async function runRedisSearchExample() {
  console.log('🔍 Starting Redis Search Example...\n');

  // 1. Create Redis adapter
  const redisAdapter = new RedisAdapter({
    host: 'localhost',
    port: 6379,
    // password: 'your-redis-password', // uncomment if needed
    keyPrefix: 'demo:',
  });

  // 2. Create server with Redis adapter
  const server = new PlugNPlayServer<SearchEvents>({
    port: 3002,
    adapter: redisAdapter,
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

  // Handle search queries
  server.on('search-query', async (data) => {
    try {
      console.log(`🔍 Searching for: "${data.query}"`);
      
      const results = await server.search({
        query: data.query,
        limit: data.limit || 10,
        streaming: data.streaming || false,
      });
      
      server.broadcast('search-results', {
        query: data.query,
        results: results.results,
        total: results.total,
        took: results.took,
      });
      
      console.log(`📊 Found ${results.total} results in ${results.took}ms`);
    } catch (error) {
      console.error(`❌ Search failed:`, error);
    }
  });

  // Start server
  await server.listen();
  console.log('✅ Server started on port 3002\n');

  // 3. Create client
  const client = new PlugNPlayClient<SearchEvents>({
    url: 'http://localhost:3002',
    logger: {
      debug: (msg, meta) => console.log(`[CLIENT DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[CLIENT INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[CLIENT WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[CLIENT ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle search results
  client.on('search-results', (data) => {
    console.log(`\n📋 Search Results for "${data.query}":`);
    console.log(`   Found ${data.total} results in ${data.took}ms`);
    
    data.results.forEach((result: any, index: number) => {
      console.log(`   ${index + 1}. ${result.id} (score: ${result.score})`);
      if (result.highlights && result.highlights.length > 0) {
        console.log(`      Highlight: ${result.highlights[0]}`);
      }
    });
    console.log('');
  });

  client.on('document-indexed', (data) => {
    const status = data.success ? '✅' : '❌';
    console.log(`${status} Document ${data.id} indexing ${data.success ? 'succeeded' : 'failed'}`);
  });

  // Connect client
  await client.connect();
  console.log('✅ Client connected\n');

  // 4. Index some sample documents
  const documents = [
    {
      id: 'doc1',
      content: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
      metadata: { category: 'programming', language: 'typescript' },
    },
    {
      id: 'doc2',
      content: 'WebSockets provide full-duplex communication channels over a single TCP connection.',
      metadata: { category: 'networking', protocol: 'websocket' },
    },
    {
      id: 'doc3',
      content: 'Redis is an open source, in-memory data structure store used as a database.',
      metadata: { category: 'database', type: 'in-memory' },
    },
    {
      id: 'doc4',
      content: 'Socket.IO enables real-time bidirectional event-based communication.',
      metadata: { category: 'networking', library: 'socket.io' },
    },
    {
      id: 'doc5',
      content: 'React is a JavaScript library for building user interfaces.',
      metadata: { category: 'frontend', framework: 'react' },
    },
  ];

  console.log('📝 Indexing documents...\n');
  for (const doc of documents) {
    client.send('index-document', doc);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait between indexing
  }

  // Wait for indexing to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 5. Perform some searches
  const searches = [
    'TypeScript programming',
    'WebSocket communication',
    'Redis database',
    'real-time',
    'JavaScript',
  ];

  console.log('\n🔍 Performing searches...\n');
  for (const query of searches) {
    client.send('search-query', { query, limit: 5 });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 6. Wait then cleanup
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\n🧹 Cleaning up...');
  client.disconnect();
  await server.close();
  await redisAdapter.disconnect();
  
  console.log('✅ Redis search example complete!');
}

// Run the example
runRedisSearchExample().catch((error) => {
  console.error('❌ Example failed:', error);
  process.exit(1);
});
