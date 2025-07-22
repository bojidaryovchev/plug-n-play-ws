# plug-n-play-ws

[![npm version](https://badge.fury.io/js/plug-n-play-ws.svg)](https://badge.fury.io/js/plug-n-play-ws)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A plug-and-play WebSocket layer on top of Socket.IO with full TypeScript support, zero manual wiring, and production-ready features.

## 🚀 Features

- **🔌 Plug-and-Play**: Single call to instantiate server and client
- **🔒 Type-Safe**: End-to-end TypeScript support with Zod validation
- **📡 Real-Time Search**: Built-in n-gram/edge-gram search with streaming results
- **💾 Scalable Storage**: Multiple adapter patterns (Memory, Redis, Upstash)
- **⚛️ React Integration**: Custom hooks for seamless React integration
- **🌐 Next.js Ready**: Built-in API route wrappers for Next.js 15
- **🔄 Auto-Reconnection**: Intelligent reconnection with backoff strategies
- **📊 Session Management**: Multi-tab support with automatic cleanup
- **🏗️ Production Ready**: Graceful shutdown, structured logging, cluster support

## 📦 Installation

```bash
npm install plug-n-play-ws
# or
yarn add plug-n-play-ws
# or
pnpm add plug-n-play-ws
```

### Peer Dependencies

```bash
npm install socket.io socket.io-client react
```

## 🏃‍♂️ Quick Start

### Server Setup

```typescript
import { PlugNPlayServer } from 'plug-n-play-ws/server';

// Create server with automatic type inference
const server = new PlugNPlayServer({
  port: 3001,
  cors: { origin: true },
});

// Handle custom events
server.on('chat-message', (data) => {
  console.log('New message:', data.message);
  server.broadcast('chat-message', data);
});

// Start server
await server.listen();
console.log('🚀 WebSocket server running on port 3001');
```

### Client Setup

```typescript
import { PlugNPlayClient } from 'plug-n-play-ws/client';

// Create type-safe client
const client = new PlugNPlayClient({
  url: 'http://localhost:3001',
  autoConnect: true,
});

// Listen for messages
client.on('chat-message', (data) => {
  console.log('Received:', data.message);
});

// Send messages
client.send('chat-message', {
  user: 'Alice',
  message: 'Hello World!',
  timestamp: Date.now(),
});
```

### React Integration

```tsx
import { usePlugNPlayWs } from 'plug-n-play-ws/react';

function ChatComponent() {
  const ws = usePlugNPlayWs({
    url: 'http://localhost:3001',
    onConnect: (data) => console.log('Connected:', data.sessionId),
    onDisconnect: (data) => console.log('Disconnected:', data.reason),
  });

  const sendMessage = () => {
    ws.send('chat-message', {
      user: 'Alice',
      message: 'Hello from React!',
      timestamp: Date.now(),
    });
  };

  return (
    <div>
      <div>Status: {ws.status}</div>
      <div>Connected: {ws.isConnected ? 'Yes' : 'No'}</div>
      <button onClick={sendMessage} disabled={!ws.isConnected}>
        Send Message
      </button>
    </div>
  );
}
```

## 📖 API Reference

### Server API

#### PlugNPlayServer

```typescript
interface ServerConfig {
  port?: number;
  cors?: CORSConfig;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  logger?: Logger;
  adapter?: IAdapter;
  redis?: RedisConfig;
  gracefulShutdownTimeout?: number;
}

class PlugNPlayServer<T extends Record<string, unknown> = EventMap> {
  constructor(config?: ServerConfig);
  
  // Server lifecycle
  async listen(port?: number): Promise<void>;
  async close(): Promise<void>;
  
  // Messaging
  async sendToSession<K extends keyof T>(sessionId: string, event: K, data: T[K]): Promise<boolean>;
  broadcast<K extends keyof T>(event: K, data: T[K]): void;
  broadcastExcept<K extends keyof T>(senderSessionId: string, event: K, data: T[K]): void;
  
  // Session management
  async getActiveSessions(): Promise<SessionMetadata[]>;
  async getSession(sessionId: string): Promise<SessionMetadata | null>;
  async disconnectSession(sessionId: string, reason?: string): Promise<boolean>;
  
  // Search functionality
  async indexContent(id: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  async removeContent(id: string): Promise<void>;
  async search(query: SearchQuery, targetSessionId?: string): Promise<SearchResponse>;
  
  // Event handling
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  emit<K extends keyof T>(event: K, data: T[K]): boolean;
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  removeAllListeners<K extends keyof T>(event?: K): this;
  
  // Statistics
  getStats(): ServerStats;
}
```

#### Search API

```typescript
interface SearchQuery {
  query: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
  streaming?: boolean;
}

interface SearchResponse<T = unknown> {
  query: string;
  results: SearchResult<T>[];
  total: number;
  took: number;
  hasMore?: boolean;
}

interface SearchResult<T = unknown> {
  id: string;
  score: number;
  data: T;
  highlights?: string[];
}
```

### Client API

#### PlugNPlayClient

```typescript
interface ClientConfig {
  url: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
  forceNew?: boolean;
  logger?: Logger;
  auth?: Record<string, unknown>;
}

class PlugNPlayClient<T extends Record<string, unknown> = EventMap> {
  constructor(config: ClientConfig);
  
  // Connection management
  async connect(): Promise<void>;
  disconnect(): void;
  
  // Messaging
  send<K extends keyof T>(event: K, data: T[K]): boolean;
  async search(query: SearchQuery): Promise<SearchResponse | null>;
  
  // Status
  getStatus(): ConnectionStatus;
  getSession(): { id?: string; metadata?: SessionMetadata };
  isConnected(): boolean;
  getStats(): ClientStats;
  
  // Event handling
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  emit<K extends keyof T>(event: K, data: T[K]): boolean;
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  removeAllListeners<K extends keyof T>(event?: K): this;
}
```

### React Hooks

#### usePlugNPlayWs

```typescript
interface UsePlugNPlayWsOptions<T> extends Omit<ClientConfig, 'autoConnect'> {
  autoConnect?: boolean;
  onConnect?: (data: { sessionId: string; metadata: SessionMetadata }) => void;
  onDisconnect?: (data: { sessionId: string; reason: string }) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

function usePlugNPlayWs<T extends Record<string, unknown> = EventMap>(
  options: UsePlugNPlayWsOptions<T>
): UsePlugNPlayWsReturn<T>;
```

#### usePlugNPlaySearch

```typescript
function usePlugNPlaySearch<T extends Record<string, unknown> = EventMap>(
  client: UsePlugNPlayWsReturn<T>
): {
  search: (query: SearchQuery) => Promise<void>;
  clearResults: () => void;
  isSearching: boolean;
  results: SearchResponse | null;
  streamingResults: unknown[];
  error: string | null;
};
```

## 🗄️ Storage Adapters

### Memory Adapter (Development)

```typescript
import { MemoryAdapter } from 'plug-n-play-ws/adapters';

const adapter = new MemoryAdapter();
const server = new PlugNPlayServer({ adapter });
```

### Redis Adapter (Production)

```typescript
import { RedisAdapter } from 'plug-n-play-ws/adapters';

const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'your-password',
  keyPrefix: 'myapp:',
});

const server = new PlugNPlayServer({ adapter });
```

### Upstash Redis Adapter (Serverless)

```typescript
import { UpstashRedisAdapter } from 'plug-n-play-ws/adapters';

const adapter = new UpstashRedisAdapter({
  url: 'https://your-redis.upstash.io',
  token: 'your-token',
  keyPrefix: 'myapp:',
});

const server = new PlugNPlayServer({ adapter });
```

## 🌐 Next.js Integration

### API Route Setup

```typescript
// app/api/ws/route.ts
import { PlugNPlayServer } from 'plug-n-play-ws/server';
import { createNextJSHandler } from 'plug-n-play-ws/nextjs';

const server = new PlugNPlayServer({
  port: 3001,
  cors: { origin: true },
});

// Start WebSocket server
server.listen().catch(console.error);

// Create API route handler
const handler = createNextJSHandler(server, {
  corsOrigin: true,
  enableHealthCheck: true,
});

export { handler as GET, handler as POST, handler as OPTIONS };
```

### Server Startup (instrumentation.ts)

```typescript
// instrumentation.ts
import { startWebSocketServer } from 'plug-n-play-ws/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await startWebSocketServer({
      port: 3001,
      cors: { origin: true },
    });
  }
}
```

## 🔍 Search Features

### Document Indexing

```typescript
// Index documents with metadata
await server.indexContent('doc1', 'TypeScript is amazing', {
  category: 'programming',
  tags: ['typescript', 'javascript'],
});

await server.indexContent('doc2', 'WebSockets enable real-time communication', {
  category: 'networking',
  tags: ['websockets', 'realtime'],
});
```

### Search with Streaming

```typescript
// Regular search
const results = await server.search({
  query: 'TypeScript programming',
  limit: 10,
  offset: 0,
});

// Streaming search
client.on('search-stream', ({ chunk, isLast }) => {
  console.log('Streaming result:', chunk);
  if (isLast) console.log('Search complete');
});

await server.search({
  query: 'TypeScript programming',
  streaming: true,
}, sessionId);
```

### Search in React

```typescript
import { usePlugNPlayWs, usePlugNPlaySearch } from 'plug-n-play-ws/react';

function SearchComponent() {
  const ws = usePlugNPlayWs({ url: 'http://localhost:3001' });
  const search = usePlugNPlaySearch(ws);

  const handleSearch = async () => {
    await search.search({
      query: 'TypeScript',
      limit: 10,
      streaming: false,
    });
  };

  return (
    <div>
      <button onClick={handleSearch} disabled={search.isSearching}>
        {search.isSearching ? 'Searching...' : 'Search'}
      </button>
      
      {search.results && (
        <div>
          <h3>Results ({search.results.total})</h3>
          {search.results.results.map(result => (
            <div key={result.id}>
              <strong>{result.id}</strong> (score: {result.score})
              {result.highlights?.map(highlight => (
                <div dangerouslySetInnerHTML={{ __html: highlight }} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 🏗️ Production Deployment

### Environment Variables

```bash
# WebSocket Configuration
WS_PORT=3001
WS_CORS_ORIGIN=https://yourdomain.com

# Redis Configuration (if using Redis adapter)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password

# Upstash Redis (if using Upstash adapter)
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-token
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

### Graceful Shutdown

```typescript
const server = new PlugNPlayServer({
  gracefulShutdownTimeout: 10000, // 10 seconds
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await server.close();
  process.exit(0);
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- server.test.ts
```

The package includes comprehensive tests for:
- Server and client functionality
- All storage adapters
- Search functionality
- Type validation
- React hooks

## 📄 License

MIT © [Your Name](https://github.com/yourusername)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📞 Support

- 📖 [Documentation](https://github.com/yourusername/plug-n-play-ws#readme)
- 🐛 [Issue Tracker](https://github.com/yourusername/plug-n-play-ws/issues)
- 💬 [Discussions](https://github.com/yourusername/plug-n-play-ws/discussions)

---

Made with ❤️ for the TypeScript community
