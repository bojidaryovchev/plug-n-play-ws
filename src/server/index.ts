// WebSocket server implementation with Socket.IO

import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'eventemitter3';
import {
  ServerConfig,
  SessionMetadata,
  EventMap,
  SearchQuery,
  SearchResponse,
  Logger,
  ConsoleLogger,
  IAdapter,
} from '../types';
import { MemoryAdapter } from '../adapters/memory';

// Simple UUID v4 implementation to avoid external dependency
function generateUUID(): string {
  return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Plug-and-play WebSocket server with full type safety and production features
 */
export class PlugNPlayServer<T extends Record<string, unknown> = EventMap> {
  
  private httpServer: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private adapter: IAdapter;
  private logger: Logger;
  private emitter: EventEmitter<T>;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;
  private activeSockets = new Set<Socket>();

  constructor(private config: ServerConfig = {}) {
    this.emitter = new EventEmitter<T>();
    this.logger = config.logger || new ConsoleLogger();
    this.adapter = config.adapter || new MemoryAdapter();
    
    // Create HTTP server
    this.httpServer = createServer();
    
    // Create Socket.IO server
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.cors?.origin || true,
        methods: config.cors?.methods || ['GET', 'POST'],
        credentials: config.cors?.credentials || false,
      },
      pingTimeout: config.heartbeatTimeout || 60000,
      pingInterval: config.heartbeatInterval || 25000,
    });

    this.setupSocketHandlers();
    this.startHeartbeat();
    this.startCleanupTask();
  }

  // Event emitter methods
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    (this.emitter as any).on(event, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    (this.emitter as any).off(event, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return (this.emitter as any).emit(event, data);
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    (this.emitter as any).once(event, listener);
    return this;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    (this.emitter as any).removeAllListeners(event);
    return this;
  }

  /**
   * Start the server on the specified port
   */
  async listen(port?: number): Promise<void> {
    const serverPort = port || this.config.port || 3001;
    
    return new Promise((resolve, reject) => {
      this.httpServer.listen(serverPort, () => {
        this.logger.info(`WebSocket server listening on port ${serverPort}`);
        resolve();
      });
      
      this.httpServer.on('error', (error: Error) => {
        this.logger.error('Server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Gracefully shutdown the server
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;
    
    this.logger.info('Starting graceful shutdown...');
    
    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all active sockets
    const closePromises: Promise<void>[] = [];
    for (const socket of this.activeSockets) {
      closePromises.push(this.disconnectSocket(socket, 'server_shutdown'));
    }

    // Wait for all sockets to close or timeout
    const shutdownTimeout = this.config.gracefulShutdownTimeout || 10000;
    await Promise.race([
      Promise.all(closePromises),
      new Promise(resolve => setTimeout(resolve, shutdownTimeout)),
    ]);

    // Close Socket.IO server
    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          this.logger.info('Server shutdown complete');
          resolve();
        });
      });
    });
  }

  /**
   * Send a typed message to a specific session
   */
  async sendToSession<K extends keyof T>(
    sessionId: string,
    event: K,
    data: T[K]
  ): Promise<boolean> {
    const socket = this.findSocketBySessionId(sessionId);
    if (socket) {
      socket.emit(event as string, data);
      return true;
    }
    return false;
  }

  /**
   * Send a typed message to all connected clients
   */
  broadcast<K extends keyof T>(event: K, data: T[K]): void {
    this.io.emit(event as string, data);
  }

  /**
   * Send a typed message to all clients except the sender
   */
  broadcastExcept<K extends keyof T>(
    senderSessionId: string,
    event: K,
    data: T[K]
  ): void {
    const senderSocket = this.findSocketBySessionId(senderSessionId);
    if (senderSocket) {
      senderSocket.broadcast.emit(event as string, data);
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<SessionMetadata[]> {
    return this.adapter.getAllSessions();
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    return this.adapter.getSession(sessionId);
  }

  /**
   * Disconnect a session
   */
  async disconnectSession(sessionId: string, reason = 'server_disconnect'): Promise<boolean> {
    const socket = this.findSocketBySessionId(sessionId);
    if (socket) {
      await this.disconnectSocket(socket, reason);
      return true;
    }
    return false;
  }

  /**
   * Index content for search
   */
  async indexContent(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.adapter.indexDocument(id, content, metadata);
  }

  /**
   * Remove content from search index
   */
  async removeContent(id: string): Promise<void> {
    await this.adapter.removeDocument(id);
  }

  /**
   * Perform a search and optionally send streaming results
   */
  async search(
    query: SearchQuery,
    targetSessionId?: string
  ): Promise<SearchResponse> {
    const results = await this.adapter.search(query);
    
    // If streaming is enabled and target session is specified
    if (query.streaming && targetSessionId) {
      const socket = this.findSocketBySessionId(targetSessionId);
      if (socket) {
        // Send results as a stream
        for (let i = 0; i < results.results.length; i++) {
          const chunk = results.results[i];
          const isLast = i === results.results.length - 1;
          
          socket.emit('search-stream', { chunk, isLast });
          
          // Small delay between chunks for better UX
          if (!isLast) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    }
    
    return results;
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', async (socket: Socket) => {
      try {
        await this.handleConnection(socket);
      } catch (error) {
        this.logger.error('Connection handler error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        socket.disconnect(true);
      }
    });
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const sessionId = generateUUID();
    this.activeSockets.add(socket);
    
    // Extract metadata from handshake
    const metadata: SessionMetadata = {
      id: sessionId,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
    };
    
    // Add optional fields only if they exist
    if (socket.handshake.auth?.userId) {
      metadata.userId = socket.handshake.auth.userId;
    }
    if (socket.handshake.auth?.tabId) {
      metadata.tabId = socket.handshake.auth.tabId;
    }
    if (socket.handshake.headers['user-agent']) {
      metadata.userAgent = socket.handshake.headers['user-agent'];
    }
    if (socket.handshake.address) {
      metadata.ip = socket.handshake.address;
    }
    if (socket.handshake.auth?.metadata) {
      metadata.metadata = socket.handshake.auth.metadata;
    }

    // Store session
    await this.adapter.setSession(sessionId, metadata);
    
    // Store session ID on socket for easy access
    (socket as unknown as { sessionId: string }).sessionId = sessionId;

    this.logger.info('Client connected', { sessionId, userId: metadata.userId });
    
    // Emit connect event
    this.emit('connect', { sessionId, metadata } as T['connect']);

    // Set up event handlers
    this.setupSocketEventHandlers(socket, sessionId);

    // Send initial connection confirmation
    socket.emit('session', { sessionId, metadata });
  }

  private setupSocketEventHandlers(socket: Socket, sessionId: string): void {
    // Handle disconnection
    socket.on('disconnect', async (reason: string) => {
      await this.handleDisconnection(socket, sessionId, reason);
    });

    // Handle heartbeat
    socket.on('ping', async (_data: unknown) => {
      await this.adapter.updateLastSeen(sessionId);
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle search requests
    socket.on('search', async (query: SearchQuery) => {
      try {
        const results = await this.search(query, sessionId);
        socket.emit('search-result', results);
      } catch (error) {
        this.logger.error('Search error', { 
          sessionId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        socket.emit('error', { 
          sessionId, 
          error: new Error('Search failed') 
        });
      }
    });

    // Handle custom events by forwarding them
    socket.onAny((event: string, data: unknown) => {
      if (!['disconnect', 'ping', 'search', 'connect'].includes(event)) {
        this.emit(event as keyof T, data as T[keyof T]);
      }
    });
  }

  private async handleDisconnection(
    socket: Socket,
    sessionId: string,
    reason: string
  ): Promise<void> {
    this.activeSockets.delete(socket);
    
    this.logger.info('Client disconnected', { sessionId, reason });
    
    // Clean up session
    await this.adapter.deleteSession(sessionId);
    
    // Emit disconnect event
    this.emit('disconnect', { sessionId, reason } as T['disconnect']);
  }

  private async disconnectSocket(socket: Socket, reason: string): Promise<void> {
    const sessionId = (socket as unknown as { sessionId?: string }).sessionId;
    if (sessionId) {
      await this.handleDisconnection(socket, sessionId, reason);
    }
    socket.disconnect(true);
  }

  private findSocketBySessionId(sessionId: string): Socket | undefined {
    for (const socket of this.activeSockets) {
      if ((socket as unknown as { sessionId?: string }).sessionId === sessionId) {
        return socket;
      }
    }
    return undefined;
  }

  private startHeartbeat(): void {
    const interval = this.config.heartbeatInterval || 30000;
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      
      this.io.emit('ping', { timestamp: Date.now() });
    }, interval);
  }

  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        await this.adapter.cleanup();
        this.logger.debug('Cleanup task completed');
      } catch (error) {
        this.logger.error('Cleanup task error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connectedClients: this.activeSockets.size,
      isShuttingDown: this.isShuttingDown,
      uptime: Date.now(), // Simplified uptime placeholder
    };
  }
}
