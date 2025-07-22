import { 
  WSMessage, 
  UserMessage, 
  PingMessage, 
  PongMessage, 
  ErrorMessage,
  SearchMessage,
  SearchResultMessage 
} from '../types';

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a user message
 */
export function createUserMessage<T>(data: T): UserMessage<T> {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'message',
    data
  };
}

/**
 * Create a ping message
 */
export function createPingMessage(): PingMessage {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'ping'
  };
}

/**
 * Create a pong message
 */
export function createPongMessage(): PongMessage {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'pong'
  };
}

/**
 * Create an error message
 */
export function createErrorMessage(error: string, code?: number): ErrorMessage {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'error',
    error,
    code
  };
}

/**
 * Create a search message
 */
export function createSearchMessage(query: string, filters?: Record<string, any>): SearchMessage {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'search',
    query,
    filters
  };
}

/**
 * Create a search result message
 */
export function createSearchResultMessage(
  results: any[], 
  total: number, 
  query: string
): SearchResultMessage {
  return {
    id: generateMessageId(),
    timestamp: Date.now(),
    type: 'search_result',
    results,
    total,
    query
  };
}

/**
 * Type guard for user messages
 */
export function isUserMessage<T>(message: WSMessage): message is UserMessage<T> {
  return message.type === 'message';
}

/**
 * Type guard for ping messages
 */
export function isPingMessage(message: WSMessage): message is PingMessage {
  return message.type === 'ping';
}

/**
 * Type guard for pong messages
 */
export function isPongMessage(message: WSMessage): message is PongMessage {
  return message.type === 'pong';
}

/**
 * Type guard for error messages
 */
export function isErrorMessage(message: WSMessage): message is ErrorMessage {
  return message.type === 'error';
}

/**
 * Type guard for search messages
 */
export function isSearchMessage(message: WSMessage): message is SearchMessage {
  return message.type === 'search';
}

/**
 * Type guard for search result messages
 */
export function isSearchResultMessage(message: WSMessage): message is SearchResultMessage {
  return message.type === 'search_result';
}

/**
 * Parse WebSocket message safely
 */
export function parseWSMessage(data: string | ArrayBuffer): WSMessage | null {
  try {
    const parsed = JSON.parse(data.toString());
    
    // Basic validation
    if (!parsed.id || !parsed.timestamp || !parsed.type) {
      return null;
    }
    
    return parsed as WSMessage;
  } catch (error) {
    return null;
  }
}

/**
 * Serialize WebSocket message
 */
export function serializeWSMessage(message: WSMessage): string {
  return JSON.stringify(message);
}

/**
 * Message rate limiter
 */
export class MessageRateLimiter {
  private messageCounts: Map<string, { count: number; lastReset: number }> = new Map();
  private maxMessages: number;
  private timeWindow: number;

  constructor(maxMessages: number = 100, timeWindowMs: number = 60000) {
    this.maxMessages = maxMessages;
    this.timeWindow = timeWindowMs;
  }

  /**
   * Check if message is allowed for the given identifier
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.messageCounts.get(identifier);

    if (!record) {
      this.messageCounts.set(identifier, { count: 1, lastReset: now });
      return true;
    }

    // Reset count if time window has passed
    if (now - record.lastReset > this.timeWindow) {
      record.count = 1;
      record.lastReset = now;
      return true;
    }

    // Check if under limit
    if (record.count < this.maxMessages) {
      record.count++;
      return true;
    }

    return false;
  }

  /**
   * Get remaining messages for identifier
   */
  getRemaining(identifier: string): number {
    const record = this.messageCounts.get(identifier);
    if (!record) {
      return this.maxMessages;
    }

    const now = Date.now();
    if (now - record.lastReset > this.timeWindow) {
      return this.maxMessages;
    }

    return Math.max(0, this.maxMessages - record.count);
  }

  /**
   * Clean up old records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [identifier, record] of this.messageCounts.entries()) {
      if (now - record.lastReset > this.timeWindow) {
        this.messageCounts.delete(identifier);
      }
    }
  }
}
