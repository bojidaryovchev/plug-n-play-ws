// Core types and interfaces for the plug-n-play-ws package

import { z } from 'zod';

/**
 * Base event schema for type-safe messaging
 */
export interface BaseEvent {
  type: string;
  payload?: unknown;
  timestamp?: number;
  sessionId?: string;
}

/**
 * Connection status enum
 */
export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Session metadata interface
 */
export interface SessionMetadata {
  id: string;
  userId?: string;
  tabId?: string;
  userAgent?: string;
  ip?: string;
  connectedAt: Date;
  lastSeenAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Search query interface
 */
export interface SearchQuery {
  query: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
  streaming?: boolean;
}

/**
 * Search result interface
 */
export interface SearchResult<T = unknown> {
  id: string;
  score: number;
  data: T;
  highlights?: string[];
}

/**
 * Search response interface
 */
export interface SearchResponse<T = unknown> {
  query: string;
  results: SearchResult<T>[];
  total: number;
  took: number;
  hasMore?: boolean;
}

/**
 * Logger interface for structured logging
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[DEBUG] ${message}`, meta || '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, meta || '');
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, meta || '');
  }
}

/**
 * Configuration options for the WebSocket server
 */
export interface ServerConfig {
  port?: number;
  cors?: {
    origin?: string | string[] | boolean;
    methods?: string[];
    credentials?: boolean;
  };
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  logger?: Logger;
  adapter?: IAdapter;
  gracefulShutdownTimeout?: number;
  maxConnections?: number;
}

/**
 * Configuration options for the WebSocket client
 */
export interface ClientConfig {
  url: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
  forceNew?: boolean;
  searchTimeout?: number; // Default: 30000ms (timeout for search operations)
  logger?: Logger;
  auth?: Record<string, unknown>;
}

/**
 * Generic storage adapter interface
 */
export interface IAdapter {
  // Session management
  setSession(sessionId: string, metadata: SessionMetadata): Promise<void>;
  getSession(sessionId: string): Promise<SessionMetadata | null>;
  deleteSession(sessionId: string): Promise<void>;
  getAllSessions(): Promise<SessionMetadata[]>;
  updateLastSeen(sessionId: string): Promise<void>;

  // Search indexing
  indexDocument(id: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  removeDocument(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResponse>;

  // Cleanup and maintenance
  cleanup(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Event type mapping for type-safe messaging
 */
export interface EventMap extends Record<string, unknown> {
  // Connection events
  connect: { sessionId: string; metadata: SessionMetadata };
  disconnect: { sessionId: string; reason: string };
  error: { sessionId: string; error: Error };
  
  // Heartbeat events
  ping: { timestamp: number };
  pong: { timestamp: number };
  
  // Search events
  search: SearchQuery;
  'search-result': SearchResponse;
  'search-stream': { chunk: SearchResult; isLast: boolean };
  
  // Custom events (can be extended)
  message: { content: string; from?: string };
  notification: { title: string; body: string; type?: string };
}

/**
 * Type-safe event emitter interface
 */
export interface TypedEventEmitter<T extends Record<string, unknown> = EventMap> {
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  emit<K extends keyof T>(event: K, data: T[K]): boolean;
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this;
  removeAllListeners<K extends keyof T>(event?: K): this;
}

/**
 * Zod schemas for runtime validation
 */
export const SessionMetadataSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  tabId: z.string().optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  connectedAt: z.date(),
  lastSeenAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(1000).default(10),
  offset: z.number().int().min(0).default(0),
  filters: z.record(z.unknown()).optional(),
  streaming: z.boolean().default(false),
});

export const SearchResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  data: z.unknown(),
  highlights: z.array(z.string()).optional(),
});

export const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
  total: z.number().int().min(0),
  took: z.number().min(0),
  hasMore: z.boolean().optional(),
});

/**
 * Utility type for extracting event data from typed event map
 */
export type EventData<T extends Record<string, unknown>, K extends keyof T> = T[K];

/**
 * Utility type for creating custom event maps that extend the base EventMap
 */
export type ExtendEventMap<T extends Record<string, unknown>> = EventMap & T;
