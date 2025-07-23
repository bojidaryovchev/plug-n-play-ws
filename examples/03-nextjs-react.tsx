// Next.js API route + React hook integration example
// 
// Setup Instructions:
// 1. Install: npm install plug-n-play-ws socket.io socket.io-client react
// 2. Add to next.config.js: { experimental: { esmExternals: true } }
// 3. For styled-jsx: npm install styled-jsx
// 4. Set environment: NEXT_PUBLIC_WS_URL=http://localhost:3001
// 5. This example demonstrates: server setup, React integration, real-time search

// ============================================================================
// File: app/api/ws/route.ts (Next.js 13+ App Router)
// ============================================================================

import { PlugNPlayServer } from 'plug-n-play-ws';
import { createNextJSHandler } from 'plug-n-play-ws/nextjs';

// Create server with enhanced configuration for production
const server = new PlugNPlayServer({
  port: 3001,
  heartbeatInterval: 30000, // 30s for web clients
  heartbeatTimeout: 60000, // 1min timeout
  cors: {
    origin: process.env.NODE_ENV === 'development' ? true : ['https://yourdomain.com'],
    credentials: true,
  },
  logger: {
    debug: (msg, meta) => console.log(`[WS DEBUG] ${msg}`, meta || ''),
    info: (msg, meta) => console.log(`[WS INFO] ${msg}`, meta || ''),
    warn: (msg, meta) => console.warn(`[WS WARN] ${msg}`, meta || ''),
    error: (msg, meta) => console.error(`[WS ERROR] ${msg}`, meta || ''),
  },
});

// Handle chat messages and index them for search
server.on('chat-message', async (data: unknown) => {
  const chatData = data as { user: string; message: string; timestamp: number };
  
  // Index message for search functionality
  const messageId = `msg-${chatData.user}-${chatData.timestamp}`;
  await server.indexContent(messageId, chatData.message, {
    user: chatData.user,
    timestamp: chatData.timestamp,
    type: 'chat-message',
  });

  // Broadcast to all connected clients
  server.broadcast('chat-message', chatData);
});

// Handle user presence
server.on('user-joined', (data: unknown) => {
  const userData = data as { user: string; timestamp: number };
  server.broadcast('user-joined', userData);
});

server.on('user-left', (data: unknown) => {
  const userData = data as { user: string; timestamp: number };
  server.broadcast('user-left', userData);
});

// Start the WebSocket server (this should ideally be done in instrumentation.ts)
server.listen().catch(console.error);

// Create the Next.js handler
const handler = createNextJSHandler(server, {
  corsOrigin: process.env.NODE_ENV === 'development' ? true : ['https://yourdomain.com'],
  enableHealthCheck: true,
});

export {
  handler as GET,
  handler as POST,
  handler as DELETE,
  handler as OPTIONS,
};

// ============================================================================
// File: components/ChatComponent.tsx
// ============================================================================

import React, { useState, useEffect } from 'react';
import { usePlugNPlayWs, usePlugNPlaySearch } from 'plug-n-play-ws/react';
import { SearchResult } from 'plug-n-play-ws';

interface ChatEvents extends Record<string, unknown> {
  'chat-message': { user: string; message: string; timestamp: number };
  'user-joined': { user: string; timestamp: number };
  'user-left': { user: string; timestamp: number };
}

interface Message {
  id: string;
  user: string;
  message: string;
  timestamp: number;
}

export function ChatComponent({ username }: { username: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize WebSocket connection with enhanced configuration
  const ws = usePlugNPlayWs<ChatEvents>({
    url: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001',
    auth: { userId: username },
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
    onConnect: (data) => {
      const connectData = data as { sessionId: string };
      console.log('Connected with session:', connectData.sessionId);
    },
    onDisconnect: (data) => {
      const disconnectData = data as { reason: string };
      console.log('Disconnected:', disconnectData.reason);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Search functionality
  const search = usePlugNPlaySearch(ws);

  // Handle incoming messages
  useEffect(() => {
    const handleMessage = (data: { user: string; message: string; timestamp: number }) => {
      const newMessage: Message = {
        id: `${data.user}-${data.timestamp}`,
        user: data.user,
        message: data.message,
        timestamp: data.timestamp,
      };
      setMessages(prev => [...prev, newMessage]);
    };

    const handleUserJoined = (data: { user: string; timestamp: number }) => {
      const systemMessage: Message = {
        id: `system-${data.timestamp}`,
        user: 'System',
        message: `${data.user} joined the chat`,
        timestamp: data.timestamp,
      };
      setMessages(prev => [...prev, systemMessage]);
    };

    const handleUserLeft = (data: { user: string; timestamp: number }) => {
      const systemMessage: Message = {
        id: `system-${data.timestamp}`,
        user: 'System',
        message: `${data.user} left the chat`,
        timestamp: data.timestamp,
      };
      setMessages(prev => [...prev, systemMessage]);
    };

    if (ws.isConnected) {
      ws.on('chat-message', handleMessage);
      ws.on('user-joined', handleUserJoined);
      ws.on('user-left', handleUserLeft);
    }

    return () => {
      ws.off('chat-message', handleMessage);
      ws.off('user-joined', handleUserJoined);
      ws.off('user-left', handleUserLeft);
    };
  }, [ws]);

  // Send message
  const sendMessage = () => {
    if (inputMessage.trim() && ws.isConnected) {
      ws.send('chat-message', {
        user: username,
        message: inputMessage.trim(),
        timestamp: Date.now(),
      });
      setInputMessage('');
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (searchQuery.trim()) {
      await search.search({
        query: searchQuery.trim(),
        limit: 10,
        streaming: false,
      });
    }
  };

  return (
    <div className="chat-container">
      {/* Connection Status */}
      <div className="status-bar">
        <span className={`status ${ws.status}`}>
          {ws.status} {ws.isConnected && `(Session: ${ws.sessionId?.slice(0, 8)}...)`}
        </span>
        <span className="connection-count">
          {ws.stats.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Messages */}
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.user === username ? 'own' : 'other'}`}>
            <span className="user">{msg.user}:</span>
            <span className="text">{msg.message}</span>
            <span className="time">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="search-section">
        <h3>Search Messages</h3>
        <div className="search-input">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={search.isSearching}>
            {search.isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {search.results && (
          <div className="search-results">
            <h4>Search Results ({search.results.total} found)</h4>
            {search.results.results.map((result: SearchResult) => (
              <div key={result.id} className="search-result">
                <strong>Score: {result.score.toFixed(2)}</strong>
                <div>{JSON.stringify(result.data)}</div>
                {result.highlights && (
                  <div className="highlights">
                    {result.highlights.map((highlight: string, i: number) => (
                      <div key={i} dangerouslySetInnerHTML={{ __html: highlight }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {search.error && (
          <div className="error">Search error: {search.error}</div>
        )}
      </div>

      {/* Message Input */}
      <div className="input-section">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          disabled={!ws.isConnected}
        />
        <button onClick={sendMessage} disabled={!ws.isConnected || !inputMessage.trim()}>
          Send
        </button>
      </div>

      {/* Note: styled-jsx requires the babel plugin in Next.js config */}
      <style jsx>{`
        .chat-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        .status-bar {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        
        .status.connected { color: green; }
        .status.connecting { color: orange; }
        .status.disconnected { color: red; }
        
        .messages {
          height: 400px;
          overflow-y: auto;
          border: 1px solid #ddd;
          padding: 10px;
          margin-bottom: 20px;
        }
        
        .message {
          margin-bottom: 10px;
          padding: 8px;
          border-radius: 4px;
        }
        
        .message.own { background: #e3f2fd; text-align: right; }
        .message.other { background: #f5f5f5; }
        
        .user { font-weight: bold; margin-right: 8px; }
        .time { font-size: 0.8em; color: #666; margin-left: 8px; }
        
        .search-section {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .search-input {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }
        
        .search-input input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .search-result {
          padding: 10px;
          border: 1px solid #eee;
          margin-bottom: 5px;
          border-radius: 4px;
        }
        
        .highlights {
          margin-top: 5px;
          font-style: italic;
          color: #666;
        }
        
        .input-section {
          display: flex;
          gap: 10px;
        }
        
        .input-section input {
          flex: 1;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        button {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .error {
          color: red;
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// File: app/chat/page.tsx
// ============================================================================

export default function ChatPage() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);

  if (!joined) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
        <h1>Join Chat</h1>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
        />
        <button
          onClick={() => username.trim() && setJoined(true)}
          disabled={!username.trim()}
          style={{ width: '100%', padding: '10px' }}
        >
          Join Chat
        </button>
      </div>
    );
  }

  return <ChatComponent username={username} />;
}
