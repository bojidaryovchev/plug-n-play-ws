// Example: React component using WebSocket hooks
import React, { useState, useEffect } from 'react';
import { useWebSocket, useTypedWebSocket } from '@plugnplay/websockets';

// Type definitions for messages
interface ChatMessage {
  type: 'chat';
  user: string;
  message: string;
  timestamp: number;
  sessionId: string;
}

interface TypingIndicator {
  type: 'typing';
  user: string;
  isTyping: boolean;
}

interface ProductUpdate {
  type: 'product_updated';
  product: {
    id: string;
    name: string;
    description: string;
    category: string;
    price: number;
  };
}

type IncomingMessage = ChatMessage | TypingIndicator | ProductUpdate;

interface OutgoingMessage {
  type: 'chat' | 'typing' | 'search';
  user?: string;
  message?: string;
  isTyping?: boolean;
  query?: string;
}

export function ChatComponent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [username, setUsername] = useState('User');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Use typed WebSocket hook
  const {
    isConnected,
    isConnecting,
    sendTypedMessage,
    search,
    lastMessage,
    error,
    reconnect
  } = useTypedWebSocket<OutgoingMessage, IncomingMessage>({
    url: 'ws://localhost:8080/ws',
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    heartbeatInterval: 30000,
    
    onConnect: () => {
      console.log('Connected to WebSocket server');
    },
    
    onDisconnect: () => {
      console.log('Disconnected from WebSocket server');
    },
    
    onError: (error) => {
      console.error('WebSocket error:', error);
    }
  });

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'message':
        const messageData = lastMessage.data as IncomingMessage;
        
        if (messageData.type === 'chat') {
          setMessages(prev => [...prev, messageData]);
        } else if (messageData.type === 'typing') {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            if (messageData.isTyping) {
              newSet.add(messageData.user);
            } else {
              newSet.delete(messageData.user);
            }
            return newSet;
          });
          
          // Clear typing indicator after 3 seconds
          setTimeout(() => {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(messageData.user);
              return newSet;
            });
          }, 3000);
        }
        break;
    }
  }, [lastMessage]);

  // Send chat message
  const sendMessage = () => {
    if (currentMessage.trim() && isConnected) {
      sendTypedMessage({
        type: 'chat',
        user: username,
        message: currentMessage.trim()
      });
      setCurrentMessage('');
    }
  };

  // Handle typing indicator
  const handleTyping = (isTyping: boolean) => {
    if (isConnected) {
      sendTypedMessage({
        type: 'typing',
        user: username,
        isTyping
      });
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (searchQuery.trim()) {
      try {
        const results = await search(searchQuery, { limit: 10 });
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      }
    }
  };

  return (
    <div className="chat-container">
      {/* Connection Status */}
      <div className="connection-status">
        {isConnecting && <span>Connecting...</span>}
        {isConnected && <span className="connected">Connected</span>}
        {error && (
          <span className="error">
            Error: {error.message}
            <button onClick={reconnect}>Reconnect</button>
          </span>
        )}
      </div>

      {/* Username Input */}
      <div className="username-section">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          disabled={!isConnected}
        />
      </div>

      {/* Search Section */}
      <div className="search-section">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products..."
          disabled={!isConnected}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} disabled={!isConnected}>
          Search
        </button>
        
        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="search-results">
            <h3>Search Results:</h3>
            {searchResults.map((result) => (
              <div key={result.id} className="search-result">
                <strong>{result.data.name}</strong> - {result.data.description}
                <span className="score">Score: {(result.score * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className="message">
            <strong>{msg.user}:</strong> {msg.message}
            <span className="timestamp">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        
        {/* Typing Indicators */}
        {typingUsers.size > 0 && (
          <div className="typing-indicators">
            {Array.from(typingUsers).join(', ')} 
            {typingUsers.size === 1 ? ' is' : ' are'} typing...
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="message-input">
        <input
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              sendMessage();
            }
          }}
          onFocus={() => handleTyping(true)}
          onBlur={() => handleTyping(false)}
          placeholder="Type a message..."
          disabled={!isConnected}
        />
        <button onClick={sendMessage} disabled={!isConnected || !currentMessage.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

// Simple connection status component
export function ConnectionStatus() {
  const { isConnected, isConnecting, error } = useWebSocketStatus('ws://localhost:8080/ws');

  return (
    <div className="connection-status">
      {isConnecting && <span>Connecting...</span>}
      {isConnected && <span className="connected">✓ Connected</span>}
      {error && <span className="error">✗ Connection Error</span>}
      {!isConnecting && !isConnected && !error && <span>Disconnected</span>}
    </div>
  );
}

export default ChatComponent;
