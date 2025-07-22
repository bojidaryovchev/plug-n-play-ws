// React hook for the WebSocket client

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ClientConfig,
  EventMap,
  ConnectionStatus,
  SearchQuery,
  SearchResponse,
  SessionMetadata,
} from '../types';
import { PlugNPlayClient } from '../client';

export interface UsePlugNPlayWsOptions
  extends Omit<ClientConfig, 'autoConnect'> {
  autoConnect?: boolean;
  onConnect?: (data: { sessionId: string; metadata: SessionMetadata }) => void;
  onDisconnect?: (data: { sessionId: string; reason: string }) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export interface UsePlugNPlayWsReturn<T extends Record<string, unknown> = EventMap> {
  // Connection state
  status: ConnectionStatus;
  isConnected: boolean;
  sessionId?: string;
  sessionMetadata?: SessionMetadata;
  
  // Methods
  connect: () => Promise<void>;
  disconnect: () => void;
  send: <K extends keyof T>(event: K, data: T[K]) => boolean;
  search: (query: SearchQuery) => Promise<SearchResponse | null>;
  
  // Event handlers
  on: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => void;
  off: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => void;
  
  // Stats
  stats: {
    status: ConnectionStatus;
    sessionId?: string;
    reconnectAttempts: number;
    lastPongTime: number;
    connected: boolean;
  };
}

/**
 * React hook for WebSocket communication with automatic state management
 */
export function usePlugNPlayWs<T extends Record<string, unknown> = EventMap>(
  options: UsePlugNPlayWsOptions
): UsePlugNPlayWsReturn<T> {
  
  const clientRef = useRef<PlugNPlayClient<T> | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [sessionId, setSessionId] = useState<string>();
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>();
  const [stats, setStats] = useState({
    status: ConnectionStatus.DISCONNECTED,
    reconnectAttempts: 0,
    lastPongTime: 0,
    connected: false,
  } as {
    status: ConnectionStatus;
    sessionId?: string;
    reconnectAttempts: number;
    lastPongTime: number;
    connected: boolean;
  });

  // Initialize client
  useEffect(() => {
    const client = new PlugNPlayClient<T>({
      ...options,
      autoConnect: false, // We control connection manually
    });

    clientRef.current = client;

    // Helper function to update stats
    const updateStats = () => {
      const currentStats = client.getStats();
      const normalizedStats = {
        status: currentStats.status,
        reconnectAttempts: currentStats.reconnectAttempts,
        lastPongTime: currentStats.lastPongTime,
        connected: currentStats.connected,
        ...(currentStats.sessionId && { sessionId: currentStats.sessionId })
      };
      setStats(normalizedStats);
    };

    // Set up event listeners
    const handleConnect = (data: { sessionId: string; metadata: SessionMetadata }) => {
      setSessionId(data.sessionId);
      setSessionMetadata(data.metadata);
      setStatus(ConnectionStatus.CONNECTED);
      updateStats();
      options.onConnect?.(data);
      options.onStatusChange?.(ConnectionStatus.CONNECTED);
    };

    const handleDisconnect = (data: { sessionId: string; reason: string }) => {
      setSessionId(undefined);
      setSessionMetadata(undefined);
      setStatus(ConnectionStatus.DISCONNECTED);
      updateStats();
      options.onDisconnect?.(data);
      options.onStatusChange?.(ConnectionStatus.DISCONNECTED);
    };

    const handleError = (error: { sessionId: string; error: Error }) => {
      options.onError?.(error.error);
    };

    // Listen for reconnection attempts to update stats
    const handleReconnectAttempt = () => {
      setStatus(ConnectionStatus.RECONNECTING);
      updateStats();
      options.onStatusChange?.(ConnectionStatus.RECONNECTING);
    };

    // Listen for pong events to update stats
    const handlePong = () => {
      updateStats();
    };

    client.on('connect', handleConnect as any);
    client.on('disconnect', handleDisconnect as any);
    client.on('error', handleError as any);
    client.on('reconnect_attempt', handleReconnectAttempt as any);
    client.on('pong', handlePong as any);

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      setStatus(ConnectionStatus.CONNECTING);
      client.connect().catch((error) => {
        options.onError?.(error instanceof Error ? error : new Error('Connection failed'));
      });
    }

    return () => {
      client.off('connect', handleConnect as any);
      client.off('disconnect', handleDisconnect as any);
      client.off('error', handleError as any);
      client.off('reconnect_attempt', handleReconnectAttempt as any);
      client.off('pong', handlePong as any);
      client.disconnect();
    };
  }, [options.url]); // Only recreate when URL changes

  // Connect method
  const connect = useCallback(async () => {
    if (clientRef.current) {
      try {
        setStatus(ConnectionStatus.CONNECTING);
        await clientRef.current.connect();
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error('Connection failed'));
        throw error;
      }
    }
  }, [options.onError]);

  // Disconnect method
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      setStatus(ConnectionStatus.DISCONNECTED);
    }
  }, []);

  // Send method
  const send = useCallback(<K extends keyof T>(event: K, data: T[K]): boolean => {
    if (clientRef.current) {
      return clientRef.current.send(event, data);
    }
    return false;
  }, []);

  // Search method
  const search = useCallback(async (query: SearchQuery): Promise<SearchResponse | null> => {
    if (clientRef.current) {
      return clientRef.current.search(query);
    }
    return null;
  }, []);

  // Event listener methods
  const on = useCallback(<K extends keyof T>(event: K, listener: (data: T[K]) => void) => {
    if (clientRef.current) {
      clientRef.current.on(event, listener);
    }
  }, []);

  const off = useCallback(<K extends keyof T>(event: K, listener: (data: T[K]) => void) => {
    if (clientRef.current) {
      clientRef.current.off(event, listener);
    }
  }, []);

  const returnValue: UsePlugNPlayWsReturn<T> = {
    // State
    status,
    isConnected: status === ConnectionStatus.CONNECTED,
    
    // Methods
    connect,
    disconnect,
    send,
    search,
    on,
    off,
    
    // Stats
    stats,
  };
  
  // Add optional properties only if they exist (for exactOptionalPropertyTypes)
  if (sessionId) {
    returnValue.sessionId = sessionId;
  }
  if (sessionMetadata) {
    returnValue.sessionMetadata = sessionMetadata;
  }
  
  return returnValue;
}

/**
 * Hook for search functionality with streaming support
 */
export function usePlugNPlaySearch<T extends Record<string, unknown> = EventMap>(
  client: UsePlugNPlayWsReturn<T>
) {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [streamingResults, setStreamingResults] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: SearchQuery) => {
    setIsSearching(true);
    setError(null);
    
    if (query.streaming) {
      setStreamingResults([]);
      
      // Listen for streaming results
      const handleStream = (data: { chunk: unknown; isLast: boolean }) => {
        setStreamingResults(prev => [...prev, data.chunk]);
        if (data.isLast) {
          setIsSearching(false);
        }
      };
      
      client.on('search-stream' as keyof T, handleStream as (data: T[keyof T]) => void);
      
      try {
        await client.search(query);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setIsSearching(false);
      } finally {
        client.off('search-stream' as keyof T, handleStream as (data: T[keyof T]) => void);
      }
    } else {
      try {
        const result = await client.search(query);
        setResults(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setIsSearching(false);
      }
    }
  }, [client]);

  const clearResults = useCallback(() => {
    setResults(null);
    setStreamingResults([]);
    setError(null);
  }, []);

  return {
    search,
    clearResults,
    isSearching,
    results,
    streamingResults,
    error,
  };
}
