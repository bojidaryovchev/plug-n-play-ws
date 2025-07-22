# @plugnplay/websockets

A comprehensive, type-safe plug-and-play WebSocket architecture for Node.js and React applications. This package provides everything you need to build real-time applications with WebSockets, including session management, search capabilities, and easy integration with Next.js.

## Features

- 🔒 **Type-safe** - Full TypeScript support with strict typing
- 🚀 **Plug & Play** - Easy integration with existing projects
- ⚡ **Real-time Communication** - Bidirectional messaging with heartbeat
- 🔍 **Built-in Search** - Edge-ngram based search with ~O(1) performance
- 💾 **Session Management** - In-memory and Redis storage options
- 🔧 **Next.js Integration** - Ready-to-use API route adapter
- ⚛️ **React Hooks** - Custom hooks for client-side integration
- 🔄 **Automatic Reconnection** - Built-in reconnection logic
- 📊 **Rate Limiting** - Message rate limiting support
- 🛡️ **Error Handling** - Comprehensive error handling and validation

## Installation

```bash
npm install @plugnplay/websockets
```

### Optional Dependencies

For Redis support:
```bash
npm install ioredis
```

For React integration:
```bash
npm install react @types/react
```

For Next.js integration:
```bash
npm install next
```

## Quick Start

### Server Setup (Basic)

```typescript
import { 
  PlugNPlayWSServer, 
  InMemorySessionStorage, 
  InMemorySearchIndex 
} from '@plugnplay/websockets';

const sessionStorage = new InMemorySessionStorage();
const searchIndex = new InMemorySearchIndex();

const wsServer = new PlugNPlayWSServer({
  port: 8080,
  sessionStorage,
  searchIndex,
  onConnect: async (session) => {
    console.log(`Client connected: ${session.id}`);
  },
  onMessage: async (session, message) => {
    console.log(`Message from ${session.id}:`, message.data);
  }
});

await wsServer.initialize();
```

### Next.js API Route

```typescript
// pages/api/websocket.ts
import { withWebSocket, InMemorySessionStorage } from '@plugnplay/websockets';

const { adapter, handler, initialize } = withWebSocket({
  sessionStorage: new InMemorySessionStorage(),
  onConnect: async (session) => {
    console.log(`Client connected: ${session.id}`);
  }
});

export default async function handler(req, res) {
  if (!isInitialized && req.socket?.server) {
    await initialize(req.socket.server, '/api/websocket');
    isInitialized = true;
  }
  return handler(req, res);
}
```

### React Client

```typescript
import { useWebSocket } from '@plugnplay/websockets';

function ChatComponent() {
  const {
    isConnected,
    sendMessage,
    search,
    lastMessage
  } = useWebSocket({
    url: 'ws://localhost:8080/ws',
    onConnect: () => console.log('Connected!'),
    onMessage: (message) => console.log('Received:', message)
  });

  const handleSendMessage = () => {
    sendMessage({ text: 'Hello, World!' });
  };

  const handleSearch = async () => {
    const results = await search('search query');
    console.log('Search results:', results);
  };

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      <button onClick={handleSendMessage}>Send Message</button>
      <button onClick={handleSearch}>Search</button>
    </div>
  );
}
```

## API Reference

### Server

#### PlugNPlayWSServer

The main WebSocket server class.

```typescript
interface WSServerConfig {
  port?: number;
  path?: string;
  sessionStorage: SessionStorage;
  searchIndex?: SearchIndex;
  heartbeatInterval?: number;
  sessionTimeout?: number;
  onMessage?: (session: Session, message: UserMessage) => Promise<void>;
  onConnect?: (session: Session) => Promise<void>;
  onDisconnect?: (session: Session) => Promise<void>;
  onError?: (error: Error, session?: Session) => void;
}
```

**Methods:**
- `initialize(port?: number)` - Start the WebSocket server
- `broadcast<T>(message: T)` - Send message to all connected clients
- `sendToSession<T>(sessionId: string, message: T)` - Send message to specific session
- `onMessage<T>(messageType: string, handler: MessageHandler<T>)` - Register custom message handler
- `getActiveSessionCount()` - Get number of active sessions
- `close()` - Close the server

#### Session Storage

**InMemorySessionStorage**
```typescript
const sessionStorage = new InMemorySessionStorage();
```

**RedisSessionStorage**
```typescript
import Redis from 'ioredis';

const redis = new Redis();
const sessionStorage = new RedisSessionStorage({
  redis,
  keyPrefix: 'ws:session:',
  serializer: {
    serialize: (session) => JSON.stringify(session),
    deserialize: (data) => JSON.parse(data)
  }
});
```

#### Search Index

**InMemorySearchIndex**
```typescript
const searchIndex = new InMemorySearchIndex({
  ngramSize: 3,
  searchFields: ['title', 'content', 'tags'],
  caseSensitive: false
});
```

**RedisSearchIndex**
```typescript
const searchIndex = new RedisSearchIndex({
  redis,
  keyPrefix: 'search:',
  ngramSize: 3,
  searchFields: ['title', 'content'],
  maxResults: 1000
});
```

### Client

#### useWebSocket Hook

```typescript
interface WSClientConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WSMessage) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (data: any) => void;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  lastMessage: WSMessage | null;
  error: Error | null;
  reconnect: () => void;
}
```

#### useTypedWebSocket Hook

For type-safe messaging:

```typescript
const {
  sendTypedMessage,
  ...rest
} = useTypedWebSocket<SendType, ReceiveType>({
  url: 'ws://localhost:8080'
});
```

## Advanced Usage

### Custom Message Handlers

```typescript
// Server
wsServer.onMessage('chat', async (data: ChatMessage, session) => {
  await wsServer.broadcast({
    type: 'chat',
    user: data.user,
    message: data.message,
    timestamp: Date.now()
  });
});

// Client
const { sendMessage } = useWebSocket({
  url: 'ws://localhost:8080',
  onMessage: (message) => {
    if (message.type === 'chat') {
      console.log('Chat message:', message.data);
    }
  }
});

sendMessage({
  type: 'chat',
  user: 'John',
  message: 'Hello everyone!'
});
```

### Search Integration

```typescript
// Add searchable data
await searchIndex.add('doc1', {
  title: 'Getting Started Guide',
  content: 'This guide helps you get started with WebSockets',
  tags: ['tutorial', 'beginner', 'websockets']
});

// Client search
const results = await search('websockets tutorial', {
  limit: 10,
  filters: { category: 'guides' }
});
```

### Session Management

```typescript
// Update session metadata
await wsServer.updateSessionMetadata(sessionId, {
  userId: 'user123',
  room: 'general',
  permissions: ['read', 'write']
});

// Get session info
const session = await wsServer.getSession(sessionId);
console.log('User:', session.metadata.userId);
```

### Rate Limiting

```typescript
import { MessageRateLimiter } from '@plugnplay/websockets';

const rateLimiter = new MessageRateLimiter(100, 60000); // 100 messages per minute

wsServer.onMessage('message', async (data, session) => {
  if (!rateLimiter.isAllowed(session.id)) {
    return; // Rate limit exceeded
  }
  
  // Process message
});
```

## Message Types

The library supports several built-in message types:

- `ping` / `pong` - Heartbeat messages
- `message` - User data messages
- `search` / `search_result` - Search functionality
- `error` - Error messages

### Custom Message Types

You can define your own message types:

```typescript
interface CustomMessage extends BaseMessage {
  type: 'custom';
  customData: {
    action: string;
    payload: any;
  };
}
```

## Configuration Options

### Server Configuration

```typescript
{
  port: 8080,                    // Server port
  path: '/ws',                   // WebSocket path
  heartbeatInterval: 30000,      // Heartbeat interval (ms)
  sessionTimeout: 300000,        // Session timeout (ms)
  sessionStorage: storage,       // Session storage implementation
  searchIndex: index,           // Search index implementation
  onConnect: async (session) => {}, // Connection handler
  onDisconnect: async (session) => {}, // Disconnection handler
  onMessage: async (session, message) => {}, // Message handler
  onError: (error, session) => {} // Error handler
}
```

### Client Configuration

```typescript
{
  url: 'ws://localhost:8080',    // WebSocket URL
  reconnectAttempts: 5,          // Max reconnection attempts
  reconnectInterval: 3000,       // Reconnection interval (ms)
  heartbeatInterval: 30000,      // Heartbeat interval (ms)
  onConnect: () => {},           // Connection handler
  onDisconnect: () => {},        // Disconnection handler
  onError: (error) => {},        // Error handler
  onMessage: (message) => {}     // Message handler
}
```

## Best Practices

1. **Use TypeScript** - Take advantage of full type safety
2. **Handle Errors** - Always implement error handlers
3. **Rate Limiting** - Implement rate limiting for production
4. **Session Cleanup** - Configure appropriate session timeouts
5. **Reconnection Logic** - Use built-in reconnection features
6. **Message Validation** - Validate message data before processing
7. **Search Indexing** - Keep search indices updated with your data

## Examples

See the `examples/` directory for complete examples:

- `basic-server.ts` - Basic WebSocket server setup
- `nextjs-api-route.ts` - Next.js integration
- `react-chat-component.tsx` - React chat component
- `redis-setup.ts` - Redis configuration
- `search-example.ts` - Search functionality

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

MIT License - see LICENSE file for details.

## Support

- 📖 Documentation: [Coming Soon]
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/plugnplay-websockets/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-org/plugnplay-websockets/discussions)
