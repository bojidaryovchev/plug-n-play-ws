import { WebSocketServer, WebSocket, RawData } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { 
  WSServerConfig, 
  Session, 
  WSMessage, 
  UserMessage, 
  PingMessage, 
  PongMessage,
  SearchMessage,
  SearchResultMessage,
  ErrorMessage,
  MessageHandlerMap,
  WSEvents
} from '../types';

export class PlugNPlayWSServer {
  private wss: WebSocketServer | null = null;
  private config: WSServerConfig;
  private connections: Map<string, WebSocket> = new Map();
  private messageHandlers: MessageHandlerMap = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: WSServerConfig) {
    this.config = {
      heartbeatInterval: 30000, // 30 seconds
      sessionTimeout: 300000, // 5 minutes
      ...config
    };
  }

  /**
   * Initialize the WebSocket server
   */
  async initialize(port?: number): Promise<void> {
    const serverPort = port || this.config.port || 8080;
    
    this.wss = new WebSocketServer({ 
      port: serverPort,
      path: this.config.path || '/ws'
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Start heartbeat mechanism
    this.startHeartbeat();
    
    // Start session cleanup
    this.startSessionCleanup();

    console.log(`WebSocket server started on port ${serverPort}`);
  }

  /**
   * Handle new WebSocket connections
   */
  private async handleConnection(ws: WebSocket): Promise<void> {
    const connectionId = uuidv4();
    const sessionId = uuidv4();
    
    // Create session
    const session: Session = {
      id: sessionId,
      connectionId,
      metadata: {},
      lastActivity: Date.now(),
      isActive: true
    };

    // Store connection and session
    this.connections.set(connectionId, ws);
    await this.config.sessionStorage.set(sessionId, session);

    // Set up connection event handlers
    ws.on('message', (data) => this.handleMessage(ws, connectionId, sessionId, data));
    ws.on('close', () => this.handleDisconnection(connectionId, sessionId));
    ws.on('error', (error) => this.handleError(error, session));
    ws.on('pong', () => this.handlePong(sessionId));

    // Notify connection
    try {
      await this.config.onConnect?.(session);
      this.emit('connect', session);
    } catch (error) {
      console.error('Error in onConnect handler:', error);
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(
    ws: WebSocket, 
    connectionId: string, 
    sessionId: string, 
    data: RawData
  ): Promise<void> {
    try {
      const message: WSMessage = JSON.parse(data.toString());
      const session = await this.config.sessionStorage.get(sessionId);
      
      if (!session) {
        this.sendError(ws, 'Session not found', 404);
        return;
      }

      // Update last activity
      await this.config.sessionStorage.updateLastActivity(sessionId);

      // Handle different message types
      switch (message.type) {
        case 'ping':
          await this.handlePing(ws, message as PingMessage);
          break;
          
        case 'search':
          await this.handleSearch(ws, session, message as SearchMessage);
          break;
          
        case 'message':
          await this.handleUserMessage(ws, session, message as UserMessage);
          break;
          
        default:
          // Check custom message handlers
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            await handler(message, session);
          } else {
            this.sendError(ws, `Unknown message type: ${message.type}`, 400);
          }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, 'Invalid message format', 400);
    }
  }

  /**
   * Handle ping messages
   */
  private async handlePing(ws: WebSocket, message: PingMessage): Promise<void> {
    const pongMessage: PongMessage = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'pong'
    };
    
    this.sendMessage(ws, pongMessage);
  }

  /**
   * Handle search messages
   */
  private async handleSearch(ws: WebSocket, session: Session, message: SearchMessage): Promise<void> {
    if (!this.config.searchIndex) {
      this.sendError(ws, 'Search not configured', 501);
      return;
    }

    try {
      const results = await this.config.searchIndex.search(message.query, message.filters);
      
      const response: SearchResultMessage = {
        id: uuidv4(),
        timestamp: Date.now(),
        type: 'search_result',
        results,
        total: results.length,
        query: message.query
      };
      
      this.sendMessage(ws, response);
      this.emit('search', message.query, results, session);
    } catch (error) {
      console.error('Search error:', error);
      this.sendError(ws, 'Search failed', 500);
    }
  }

  /**
   * Handle user messages
   */
  private async handleUserMessage(ws: WebSocket, session: Session, message: UserMessage): Promise<void> {
    try {
      await this.config.onMessage?.(session, message);
      this.emit('message', message, session);
    } catch (error) {
      console.error('Error in onMessage handler:', error);
      this.sendError(ws, 'Message processing failed', 500);
    }
  }

  /**
   * Handle connection disconnect
   */
  private async handleDisconnection(connectionId: string, sessionId: string): Promise<void> {
    this.connections.delete(connectionId);
    
    const session = await this.config.sessionStorage.get(sessionId);
    if (session) {
      session.isActive = false;
      await this.config.sessionStorage.set(sessionId, session);
      
      try {
        await this.config.onDisconnect?.(session);
        this.emit('disconnect', session);
      } catch (error) {
        console.error('Error in onDisconnect handler:', error);
      }
    }
  }

  /**
   * Handle pong responses
   */
  private async handlePong(sessionId: string): Promise<void> {
    await this.config.sessionStorage.updateLastActivity(sessionId);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error, session?: Session): void {
    console.error('WebSocket error:', error);
    this.config.onError?.(error, session);
    this.emit('error', error, session);
  }

  /**
   * Send message to specific connection
   */
  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message
   */
  private sendError(ws: WebSocket, error: string, code?: number): void {
    const errorMessage: ErrorMessage = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'error',
      error,
      code
    };
    
    this.sendMessage(ws, errorMessage);
  }

  /**
   * Broadcast message to all active sessions
   */
  async broadcast<T>(message: T): Promise<void> {
    const activeSessions = await this.config.sessionStorage.getActiveSessions();
    
    const wsMessage: UserMessage<T> = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'message',
      data: message
    };

    for (const session of activeSessions) {
      const ws = this.connections.get(session.connectionId);
      if (ws) {
        this.sendMessage(ws, wsMessage);
      }
    }
  }

  /**
   * Send message to specific session
   */
  async sendToSession<T>(sessionId: string, message: T): Promise<boolean> {
    const session = await this.config.sessionStorage.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    const ws = this.connections.get(session.connectionId);
    if (!ws) {
      return false;
    }

    const wsMessage: UserMessage<T> = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'message',
      data: message
    };

    this.sendMessage(ws, wsMessage);
    return true;
  }

  /**
   * Register custom message handler
   */
  onMessage<T = any>(messageType: string, handler: (data: T, session: Session) => Promise<void> | void): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      const activeSessions = await this.config.sessionStorage.getActiveSessions();
      
      for (const session of activeSessions) {
        const ws = this.connections.get(session.connectionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, this.config.heartbeatInterval!);
  }

  /**
   * Start session cleanup
   */
  private startSessionCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      await this.config.sessionStorage.cleanup(this.config.sessionTimeout!);
    }, 60000); // Run cleanup every minute
  }

  /**
   * Get active session count
   */
  async getActiveSessionCount(): Promise<number> {
    const activeSessions = await this.config.sessionStorage.getActiveSessions();
    return activeSessions.length;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return await this.config.sessionStorage.get(sessionId);
  }

  /**
   * Update session metadata
   */
  async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<boolean> {
    const session = await this.config.sessionStorage.get(sessionId);
    if (!session) {
      return false;
    }

    session.metadata = { ...session.metadata, ...metadata };
    await this.config.sessionStorage.set(sessionId, session);
    return true;
  }

  /**
   * Event emitter functionality
   */
  private eventListeners: Map<keyof WSEvents, Function[]> = new Map();

  on<K extends keyof WSEvents>(event: K, listener: WSEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  private emit<K extends keyof WSEvents>(event: K, ...args: Parameters<WSEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      }
    }
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.connections.clear();
    this.messageHandlers.clear();
    this.eventListeners.clear();
  }
}
