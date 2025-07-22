import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  WSClientConfig, 
  UseWebSocketReturn, 
  WSMessage, 
  UserMessage, 
  PingMessage, 
  PongMessage,
  SearchMessage,
  SearchResultMessage,
  SearchOptions,
  SearchResult 
} from '../types';

export function useWebSocket<T = any>(config: WSClientConfig): UseWebSocketReturn<T> {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage<T> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const searchPromisesRef = useRef<Map<string, { resolve: (results: SearchResult[]) => void; reject: (error: Error) => void }>>(new Map());

  const {
    url,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    heartbeatInterval = 30000,
    onConnect,
    onDisconnect,
    onError,
    onMessage
  } = config;

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Send message helper
  const sendMessage = useCallback((message: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Send user message
  const sendUserMessage = useCallback((data: T) => {
    const message: UserMessage<T> = {
      id: generateMessageId(),
      timestamp: Date.now(),
      type: 'message',
      data
    };
    
    if (!sendMessage(message)) {
      throw new Error('WebSocket is not connected');
    }
  }, [sendMessage, generateMessageId]);

  // Search function
  const search = useCallback(async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      
      const searchMessage: SearchMessage = {
        id: messageId,
        timestamp: Date.now(),
        type: 'search',
        query,
        filters: options
      };

      // Store promise resolvers
      searchPromisesRef.current.set(messageId, { resolve, reject });

      // Set timeout for search
      setTimeout(() => {
        const promise = searchPromisesRef.current.get(messageId);
        if (promise) {
          searchPromisesRef.current.delete(messageId);
          promise.reject(new Error('Search timeout'));
        }
      }, 10000); // 10 second timeout

      if (!sendMessage(searchMessage)) {
        searchPromisesRef.current.delete(messageId);
        reject(new Error('WebSocket is not connected'));
      }
    });
  }, [sendMessage, generateMessageId]);

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      const pingMessage: PingMessage = {
        id: generateMessageId(),
        timestamp: Date.now(),
        type: 'ping'
      };
      sendMessage(pingMessage);
    }, heartbeatInterval);
  }, [sendMessage, generateMessageId, heartbeatInterval]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage<T> = JSON.parse(event.data);
      setLastMessage(message);

      // Handle different message types
      switch (message.type) {
        case 'pong':
          // Heartbeat response - no action needed
          break;

        case 'search_result':
          const searchResult = message as SearchResultMessage;
          const searchPromise = searchPromisesRef.current.get(searchResult.id);
          if (searchPromise) {
            searchPromisesRef.current.delete(searchResult.id);
            searchPromise.resolve(searchResult.results);
          }
          break;

        case 'error':
          console.error('WebSocket error message:', message);
          break;

        case 'message':
          onMessage?.(message);
          break;

        default:
          onMessage?.(message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [onMessage]);

  // Connect function
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
        onConnect?.();
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        stopHeartbeat();
        
        // Clear search promises
        searchPromisesRef.current.forEach((promise) => {
          promise.reject(new Error('WebSocket connection closed'));
        });
        searchPromisesRef.current.clear();

        onDisconnect?.();

        // Attempt reconnection
        if (reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (event) => {
        const wsError = new Error('WebSocket connection error');
        setError(wsError);
        setIsConnecting(false);
        onError?.(event);
      };

    } catch (err) {
      const connectionError = err instanceof Error ? err : new Error('Failed to create WebSocket connection');
      setError(connectionError);
      setIsConnecting(false);
    }
  }, [url, onConnect, onDisconnect, onError, handleMessage, startHeartbeat, stopHeartbeat, reconnectAttempts, reconnectInterval]);

  // Reconnect function
  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      // Cleanup
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopHeartbeat();
      
      // Clear search promises
      searchPromisesRef.current.forEach((promise) => {
        promise.reject(new Error('Component unmounted'));
      });
      searchPromisesRef.current.clear();

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, stopHeartbeat]);

  return {
    isConnected,
    isConnecting,
    sendMessage: sendUserMessage,
    search,
    lastMessage,
    error,
    reconnect
  };
}

/**
 * Hook for managing WebSocket connections with typed messages
 */
export function useTypedWebSocket<SendType = any, ReceiveType = any>(
  config: WSClientConfig
): UseWebSocketReturn<ReceiveType> & {
  sendTypedMessage: (data: SendType) => void;
} {
  const wsHook = useWebSocket<ReceiveType>(config);
  
  const sendTypedMessage = useCallback((data: SendType) => {
    wsHook.sendMessage(data as any);
  }, [wsHook.sendMessage]);

  return {
    ...wsHook,
    sendTypedMessage
  };
}

/**
 * Hook for WebSocket connection status only
 */
export function useWebSocketStatus(url: string): {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
} {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsConnecting(true);
    
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };

    ws.onerror = () => {
      setError(new Error('WebSocket connection failed'));
      setIsConnecting(false);
    };

    return () => {
      ws.close();
    };
  }, [url]);

  return { isConnected, isConnecting, error };
}
