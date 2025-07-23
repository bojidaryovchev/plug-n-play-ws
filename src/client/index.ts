// WebSocket client implementation with Socket.IO

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';
import {
  ClientConfig,
  EventMap,
  ConnectionStatus,
  SearchQuery,
  SearchResponse,
  SearchResult,
  SessionMetadata,
  Logger,
  ConsoleLogger,
  SearchQuerySchema,
} from '../types';

/**
 * Plug-and-play WebSocket client with full type safety and auto-reconnection
 */
export class PlugNPlayClient<T extends Record<string, unknown> = EventMap> {
  
  private socket: Socket | undefined;
  private emitter: EventEmitter;
  private logger: Logger;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private sessionId?: string;
  private sessionMetadata?: SessionMetadata;
  private reconnectAttempts = 0;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private lastPongTime = 0;

  constructor(private config: ClientConfig) {
    this.emitter = new EventEmitter();
    this.logger = config.logger || new ConsoleLogger();
    
    if (config.autoConnect !== false) {
      void this.connect();
    }
  }

  // Event emitter methods
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return this.emitter.emit(event as string, data);
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    this.emitter.removeAllListeners(event as string);
    return this;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    this.setStatus(ConnectionStatus.CONNECTING);
    this.logger.info('Connecting to WebSocket server', { url: this.config.url });

    return new Promise((resolve, reject) => {
      this.socket = io(this.config.url, {
        autoConnect: false,
        reconnection: this.config.reconnection !== false,
        reconnectionAttempts: this.config.reconnectionAttempts || 5,
        reconnectionDelay: this.config.reconnectionDelay || 1000,
        reconnectionDelayMax: this.config.reconnectionDelayMax || 5000,
        timeout: this.config.timeout || 20000,
        forceNew: this.config.forceNew || false,
        auth: this.config.auth || {},
      });

      this.setupSocketHandlers(resolve, reject);
      this.socket.connect();
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      delete this.heartbeatInterval;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
    
    this.setStatus(ConnectionStatus.DISCONNECTED);
    // Don't clear session data immediately - preserve for potential reconnection
    // Session data will be refreshed on successful reconnection
    this.reconnectAttempts = 0;
  }

  /**
   * Completely clear session and disconnect
   */
  clearSession(): void {
    this.disconnect();
    delete this.sessionId;
    delete this.sessionMetadata;
  }

  /**
   * Send a typed message to the server
   */
  send<K extends keyof T>(event: K, data: T[K]): boolean {
    if (!this.socket?.connected) {
      this.logger.warn('Cannot send message: not connected', { event: event as string });
      return false;
    }

    this.socket.emit(event as string, data);
    return true;
  }

  /**
   * Perform a search query
   */
  async search(query: SearchQuery): Promise<SearchResponse | null> {
    if (!this.socket?.connected) {
      this.logger.warn('Cannot search: not connected');
      return null;
    }

    try {
      // Validate search query on client side
      const validatedQuery = SearchQuerySchema.parse(query) as SearchQuery;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.socket?.off('search-result', handleResult);
          this.socket?.off('error', handleError);
          resolve(null);
        }, this.config.searchTimeout ?? 30000);

        const handleResult = (result: SearchResponse) => {
          clearTimeout(timeout);
          this.socket?.off('search-result', handleResult);
          this.socket?.off('error', handleError);
          resolve(result);
        };

        const handleError = (error: { error: Error }) => {
          clearTimeout(timeout);
          this.socket?.off('search-result', handleResult);
          this.socket?.off('error', handleError);
          this.logger.error('Search failed', { error: error.error.message });
          resolve(null);
        };

        this.socket?.once('search-result', handleResult);
        this.socket?.once('error', handleError);
        this.socket?.emit('search', validatedQuery);
      });
    } catch (error) {
      this.logger.error('Invalid search query', { 
        error: error instanceof Error ? error.message : 'Unknown validation error' 
      });
      return null;
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get current session information
   */
  getSession(): { id?: string; metadata?: SessionMetadata } {
    return {
      ...(this.sessionId && { id: this.sessionId }),
      ...(this.sessionMetadata && { metadata: this.sessionMetadata }),
    };
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED && !!this.socket?.connected;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      status: this.status,
      sessionId: this.sessionId,
      reconnectAttempts: this.reconnectAttempts,
      lastPongTime: this.lastPongTime,
      connected: this.isConnected(),
    };
  }

  private setupSocketHandlers(
    resolve: () => void, 
    reject: (error: Error) => void
  ): void {
    if (!this.socket) return;

    // Connection successful
    this.socket.on('connect', () => {
      this.setStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;
      this.logger.info('Connected to WebSocket server');
      this.startHeartbeat();
      resolve();
    });

    // Handle session data from server  
    this.socket.on('session', (data: { sessionId: string; metadata: SessionMetadata }) => {
      this.sessionId = data.sessionId;
      this.sessionMetadata = data.metadata;
      this.emit('connect', data as T['connect']);
    });

    // Connection error
    this.socket.on('connect_error', (error: Error) => {
      this.setStatus(ConnectionStatus.ERROR);
      this.logger.error('Connection error', { error: error.message });
      
      if (this.reconnectAttempts === 0) {
        reject(error);
      }
    });

    // Disconnection
    this.socket.on('disconnect', (reason: string) => {
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.logger.info('Disconnected from WebSocket server', { reason });
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        delete this.heartbeatInterval;
      }

      this.emit('disconnect', { sessionId: this.sessionId || '', reason } as T['disconnect']);
    });

    // Reconnection attempt
    this.socket.on('reconnect_attempt', (attemptNumber: number) => {
      this.setStatus(ConnectionStatus.RECONNECTING);
      this.reconnectAttempts = attemptNumber;
      this.logger.info('Reconnection attempt', { attempt: attemptNumber });
    });

    // Reconnection successful
    this.socket.on('reconnect', (attemptNumber: number) => {
      this.setStatus(ConnectionStatus.CONNECTED);
      this.logger.info('Reconnected to WebSocket server', { attempts: attemptNumber });
      this.startHeartbeat();
    });

    // Handle heartbeat response
    this.socket.on('pong', (data: { timestamp: number }) => {
      this.lastPongTime = data.timestamp;
    });

    // Handle search stream results
    this.socket.on('search-stream', (data: { chunk: SearchResult; isLast: boolean }) => {
      this.emit('search-stream' as keyof T, data as T[keyof T]);
    });

    // Forward all other events
    this.socket.onAny((event: string, data: unknown) => {
      if (!['connect', 'connect_error', 'disconnect', 'reconnect_attempt', 'reconnect', 'pong', 'search-stream'].includes(event)) {
        this.emit(event as keyof T, data as T[keyof T]);
      }
    });
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      const oldStatus = this.status;
      this.status = status;
      this.logger.debug('Status changed', { from: oldStatus, to: status });
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', { timestamp: Date.now() });
      }
    }, 30000);
  }
}
