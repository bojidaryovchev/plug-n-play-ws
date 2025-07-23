// Upstash Redis (serverless) example with environment configuration

import { PlugNPlayServer, PlugNPlayClient, createRedisAdapterFromEnv, SearchResult } from '../src';

// Custom event types for serverless search
interface ServerlessEvents extends Record<string, unknown> {
  'add-content': { id: string; title: string; content: string; tags: string[] };
  'search-content': { query: string; filters?: Record<string, unknown> };
  'content-added': { id: string; success: boolean; message?: string };
  'search-results': { query: string; results: SearchResult[]; total: number; took: number };
}

async function runUpstashExample() {
  console.log('☁️  Starting Upstash Redis (Serverless) Example...\n');

  console.log('📋 Configuration:');
  console.log('   Set these environment variables for Upstash Redis:');
  console.log('   - UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io');
  console.log('   - UPSTASH_REDIS_REST_TOKEN=your-token-here');
  console.log('   \n   Or for regular Redis:');
  console.log('   - REDIS_URL=redis://localhost:6379');
  console.log('   - REDIS_HOST=localhost (default)');
  console.log('   - REDIS_PORT=6379 (default)');
  console.log('   - REDIS_PASSWORD=your-password (optional)\n');

  // 1. Create adapter from environment variables
  // This will automatically detect and use Upstash if available, fallback to Redis
  const adapter = createRedisAdapterFromEnv('serverless:', {
    ngramSize: 3,
    minEdgegram: 1,
    maxEdgegram: 6,
    exactMatchBoost: 200,
    ngramWeight: 0.4,
    edgegramWeight: 1.3,
    minScore: 0.1,
  });

  // 2. Create server optimized for serverless/edge environments
  const server = new PlugNPlayServer<ServerlessEvents>({
    port: 3004,
    adapter,
    maxConnections: 100, // Higher limit for serverless scalability
    heartbeatInterval: 15000, // Longer intervals for serverless efficiency
    heartbeatTimeout: 30000,
    cors: {
      origin: true, // Enable CORS for web clients
      credentials: true,
    },
    logger: {
      debug: (msg, meta) => console.log(`[SERVER DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[SERVER INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[SERVER WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[SERVER ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle content addition with metadata
  server.on('add-content', async (data) => {
    try {
      console.log(`📝 Adding content: ${data.title}`);
      
      // Create rich metadata for better search
      const metadata = {
        title: data.title,
        tags: data.tags,
        wordCount: data.content.split(' ').length,
        addedAt: new Date().toISOString(),
        type: 'article',
      };
      
      await server.indexContent(data.id, data.content, metadata);
      
      server.broadcast('content-added', {
        id: data.id,
        success: true,
        message: `Content "${data.title}" successfully indexed`,
      });
      
      console.log(`✅ Content indexed: ${data.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to index content ${data.id}:`, errorMsg);
      
      server.broadcast('content-added', {
        id: data.id,
        success: false,
        message: `Failed to index: ${errorMsg}`,
      });
    }
  });

  // Handle search with optional filters
  server.on('search-content', async (data) => {
    try {
      console.log(`🔍 Searching: "${data.query}"`);
      
      const results = await server.search({
        query: data.query,
        limit: 20,
        filters: data.filters,
        streaming: false, // Regular search for this example
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
  console.log('✅ Server started on port 3004\n');

  // 3. Create client
  const client = new PlugNPlayClient<ServerlessEvents>({
    url: 'http://localhost:3004',
    timeout: 10000, // Longer timeout for serverless cold starts
    reconnectionAttempts: 3,
    reconnectionDelay: 2000,
    logger: {
      debug: (msg, meta) => console.log(`[CLIENT DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[CLIENT INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[CLIENT WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[CLIENT ERROR] ${msg}`, meta || ''),
    },
  });

  // Handle search results with rich display
  client.on('search-results', (data: unknown) => {
    const searchData = data as { query: string; results: SearchResult[]; total: number; took: number };
    
    console.log(`\n📋 Search Results for "${searchData.query}":`);
    console.log(`   Found ${searchData.total} results in ${searchData.took}ms`);
    
    if (searchData.results.length === 0) {
      console.log('   No results found.\n');
      return;
    }
    
    searchData.results.forEach((result, index) => {
      console.log(`\n   ${index + 1}. ${result.id} (score: ${result.score.toFixed(3)})`);
      
      // Show metadata if available
      if (result.data && typeof result.data === 'object') {
        const metadata = result.data as Record<string, unknown>;
        if (metadata.title) console.log(`      📄 Title: ${metadata.title}`);
        if (metadata.tags) console.log(`      🏷️  Tags: ${JSON.stringify(metadata.tags)}`);
        if (metadata.wordCount) console.log(`      📊 Words: ${metadata.wordCount}`);
      }
      
      // Show highlights
      if (result.highlights && result.highlights.length > 0) {
        console.log(`      💡 Highlight: ${result.highlights[0]}`);
      }
    });
    console.log('');
  });

  // Handle content addition status
  client.on('content-added', (data: unknown) => {
    const addData = data as { id: string; success: boolean; message?: string };
    const status = addData.success ? '✅' : '❌';
    console.log(`${status} ${addData.message}`);
  });

  // Connect client
  await client.connect();
  console.log('✅ Client connected\n');

  // 4. Add diverse content for testing
  const contentLibrary = [
    {
      id: 'next-js-guide',
      title: 'Complete Next.js Guide',
      content: 'Next.js is a React framework that provides hybrid static and server rendering, TypeScript support, smart bundling, route pre-fetching, and more. It gives you the best developer experience with all the features you need for production: hybrid static & server rendering, TypeScript support, smart bundling, route pre-fetching, and more. No config needed.',
      tags: ['nextjs', 'react', 'framework', 'ssr', 'typescript'],
    },
    {
      id: 'serverless-architecture',
      title: 'Serverless Architecture Patterns',
      content: 'Serverless computing allows you to build and run applications and services without thinking about servers. Serverless applications are event-driven cloud-based systems where application development rely solely on a combination of third-party services, client-side logic and cloud-hosted remote procedure calls.',
      tags: ['serverless', 'cloud', 'architecture', 'aws', 'azure'],
    },
    {
      id: 'websocket-realtime',
      title: 'Real-time Communication with WebSockets',
      content: 'WebSocket is a computer communications protocol, providing full-duplex communication channels over a single TCP connection. Unlike HTTP, WebSocket provides full-duplex communication. Additionally, WebSocket connections can send data to the server at any time, without the client having to request it.',
      tags: ['websocket', 'realtime', 'communication', 'protocol', 'tcp'],
    },
    {
      id: 'redis-performance',
      title: 'Redis Performance Optimization',
      content: 'Redis is an in-memory data structure store, used as a distributed, in-memory key–value database, cache and message broker, with optional durability. Redis supports different kinds of abstract data structures, such as strings, lists, maps, sets, sorted sets, HyperLogLogs, bitmaps, streams, and spatial indexes.',
      tags: ['redis', 'performance', 'cache', 'database', 'memory'],
    },
    {
      id: 'typescript-advanced',
      title: 'Advanced TypeScript Patterns',
      content: 'TypeScript is a programming language developed and maintained by Microsoft. It is a strict syntactical superset of JavaScript and adds optional static typing to the language. TypeScript is designed for the development of large applications and transcompiles to JavaScript.',
      tags: ['typescript', 'javascript', 'types', 'patterns', 'microsoft'],
    },
    {
      id: 'docker-microservices',
      title: 'Microservices with Docker',
      content: 'Docker is a set of platform as a service products that use OS-level virtualization to deliver software in packages called containers. Docker can package an application and its dependencies in a virtual container that can run on any Linux, Windows, or macOS computer.',
      tags: ['docker', 'microservices', 'containers', 'devops', 'virtualization'],
    },
  ];

  console.log('📝 Adding content to serverless database...\n');
  for (const content of contentLibrary) {
    client.send('add-content', content);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Respect rate limits
  }

  // Wait for content to be indexed
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 5. Perform searches with different strategies
  const searchQueries = [
    { query: 'React framework TypeScript', filters: undefined },
    { query: 'serverless cloud computing', filters: { type: 'article' } },
    { query: 'real-time WebSocket communication', filters: undefined },
    { query: 'Redis performance optimization', filters: undefined },
    { query: 'Docker containers microservices', filters: undefined },
    { query: 'JavaScript TypeScript development', filters: undefined },
  ];

  console.log('\n🔍 Testing search functionality...\n');
  
  for (const search of searchQueries) {
    console.log(`🔎 Query: "${search.query}"${search.filters ? ' with filters' : ''}`);
    
    client.send('search-content', search);
    
    // Wait between searches
    await new Promise(resolve => setTimeout(resolve, 2500));
  }

  // 6. Cleanup
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\n🧹 Cleaning up...');
  client.disconnect();
  await server.close();
  await adapter.disconnect();
  
  console.log('✅ Upstash serverless example complete!');
  console.log('\n💡 This example works with both Upstash Redis and regular Redis,');
  console.log('   automatically detecting based on environment variables.');
}

// Run the example
runUpstashExample().catch((error) => {
  console.error('❌ Upstash example failed:', error);
  process.exit(1);
});
