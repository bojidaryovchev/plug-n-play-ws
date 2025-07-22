// Core message types
export interface BaseMessage {
  id: string;
  timestamp: number;
  type: string;
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
}

export interface UserMessage<T = any> extends BaseMessage {
  type: 'message';
  data: T;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  error: string;
  code?: number;
}

export interface SearchMessage extends BaseMessage {
  type: 'search';
  query: string;
  filters?: Record<string, any>;
}

export interface SearchResultMessage extends BaseMessage {
  type: 'search_result';
  results: SearchResult[];
  total: number;
  query: string;
}

export type WSMessage<T = any> = 
  | PingMessage 
  | PongMessage 
  | UserMessage<T> 
  | ErrorMessage 
  | SearchMessage 
  | SearchResultMessage;

// Session management
export interface Session {
  id: string;
  userId?: string;
  connectionId: string;
  metadata: Record<string, any>;
  lastActivity: number;
  isActive: boolean;
}

export interface SessionStorage {
  set(sessionId: string, session: Session): Promise<void>;
  get(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<void>;
  getActiveSessions(): Promise<Session[]>;
  updateLastActivity(sessionId: string): Promise<void>;
  cleanup(maxAge: number): Promise<void>;
}

// Search types
export interface SearchResult {
  id: string;
  score: number;
  data: Record<string, any>;
  highlights?: Record<string, string[]>;
}

export interface SearchIndex {
  add(id: string, data: Record<string, any>): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  clear(): Promise<void>;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  fields?: string[];
  fuzzy?: boolean;
}

// WebSocket server configuration
export interface WSServerConfig {
  port?: number;
  path?: string;
  sessionStorage: SessionStorage;
  searchIndex?: SearchIndex;
  heartbeatInterval?: number;
  sessionTimeout?: number;
  onMessage?: <T>(session: Session, message: UserMessage<T>) => Promise<void>;
  onConnect?: (session: Session) => Promise<void>;
  onDisconnect?: (session: Session) => Promise<void>;
  onError?: (error: Error, session?: Session) => void;
}

// Client configuration
export interface WSClientConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onMessage?: <T>(message: WSMessage<T>) => void;
}

// React hook types
export interface UseWebSocketReturn<T = any> {
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (data: T) => void;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  lastMessage: WSMessage<T> | null;
  error: Error | null;
  reconnect: () => void;
}

// Message handler types
export type MessageHandler<T = any> = (data: T, session: Session) => Promise<void> | void;
export type MessageHandlerMap = Map<string, MessageHandler>;

// Events
export interface WSEvents {
  connect: (session: Session) => void;
  disconnect: (session: Session) => void;
  message: <T>(message: UserMessage<T>, session: Session) => void;
  error: (error: Error, session?: Session) => void;
  search: (query: string, results: SearchResult[], session: Session) => void;
}
