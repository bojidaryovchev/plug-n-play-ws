import { WSServerConfig, WSClientConfig, Session, SearchOptions } from '../types';

/**
 * Validate WebSocket server configuration
 */
export function validateServerConfig(config: WSServerConfig): string[] {
  const errors: string[] = [];

  if (!config.sessionStorage) {
    errors.push('sessionStorage is required');
  }

  if (config.port && (config.port < 1 || config.port > 65535)) {
    errors.push('port must be between 1 and 65535');
  }

  if (config.heartbeatInterval && config.heartbeatInterval < 1000) {
    errors.push('heartbeatInterval must be at least 1000ms');
  }

  if (config.sessionTimeout && config.sessionTimeout < 10000) {
    errors.push('sessionTimeout must be at least 10000ms');
  }

  return errors;
}

/**
 * Validate WebSocket client configuration
 */
export function validateClientConfig(config: WSClientConfig): string[] {
  const errors: string[] = [];

  if (!config.url) {
    errors.push('url is required');
  } else {
    try {
      new URL(config.url);
    } catch {
      errors.push('url must be a valid URL');
    }
  }

  if (config.reconnectAttempts && config.reconnectAttempts < 0) {
    errors.push('reconnectAttempts must be non-negative');
  }

  if (config.reconnectInterval && config.reconnectInterval < 1000) {
    errors.push('reconnectInterval must be at least 1000ms');
  }

  if (config.heartbeatInterval && config.heartbeatInterval < 5000) {
    errors.push('heartbeatInterval must be at least 5000ms');
  }

  return errors;
}

/**
 * Validate session object
 */
export function validateSession(session: Session): string[] {
  const errors: string[] = [];

  if (!session.id) {
    errors.push('session.id is required');
  }

  if (!session.connectionId) {
    errors.push('session.connectionId is required');
  }

  if (typeof session.lastActivity !== 'number' || session.lastActivity < 0) {
    errors.push('session.lastActivity must be a positive number');
  }

  if (typeof session.isActive !== 'boolean') {
    errors.push('session.isActive must be a boolean');
  }

  if (session.metadata && typeof session.metadata !== 'object') {
    errors.push('session.metadata must be an object');
  }

  return errors;
}

/**
 * Validate search options
 */
export function validateSearchOptions(options: SearchOptions): string[] {
  const errors: string[] = [];

  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || options.limit < 1 || options.limit > 1000) {
      errors.push('limit must be a number between 1 and 1000');
    }
  }

  if (options.offset !== undefined) {
    if (typeof options.offset !== 'number' || options.offset < 0) {
      errors.push('offset must be a non-negative number');
    }
  }

  if (options.fields !== undefined) {
    if (!Array.isArray(options.fields)) {
      errors.push('fields must be an array');
    } else if (options.fields.some(field => typeof field !== 'string')) {
      errors.push('all fields must be strings');
    }
  }

  if (options.fuzzy !== undefined && typeof options.fuzzy !== 'boolean') {
    errors.push('fuzzy must be a boolean');
  }

  return errors;
}

/**
 * Validate message data
 */
export function validateMessageData(data: any): string[] {
  const errors: string[] = [];

  if (data === null || data === undefined) {
    errors.push('message data cannot be null or undefined');
    return errors;
  }

  // Check for circular references
  try {
    JSON.stringify(data);
  } catch (error) {
    errors.push('message data must be serializable (no circular references)');
  }

  return errors;
}

/**
 * Validate WebSocket URL
 */
export function validateWebSocketUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Validate session ID format
 */
export function validateSessionId(sessionId: string): boolean {
  // UUID v4 format or similar
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(sessionId) || (sessionId.length >= 8 && sessionId.length <= 64);
}

/**
 * Validate search query
 */
export function validateSearchQuery(query: string): string[] {
  const errors: string[] = [];

  if (typeof query !== 'string') {
    errors.push('query must be a string');
    return errors;
  }

  if (query.trim().length === 0) {
    errors.push('query cannot be empty');
  }

  if (query.length > 1000) {
    errors.push('query must be less than 1000 characters');
  }

  return errors;
}

/**
 * Sanitize user input for search
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/[^\w\s\-_.]/g, ' ') // Keep only alphanumeric, spaces, hyphens, underscores, dots
    .replace(/\s+/g, ' ') // Normalize whitespace
    .substring(0, 1000); // Limit length
}

/**
 * Validate rate limiting parameters
 */
export function validateRateLimitConfig(maxMessages: number, timeWindowMs: number): string[] {
  const errors: string[] = [];

  if (typeof maxMessages !== 'number' || maxMessages < 1 || maxMessages > 10000) {
    errors.push('maxMessages must be a number between 1 and 10000');
  }

  if (typeof timeWindowMs !== 'number' || timeWindowMs < 1000 || timeWindowMs > 3600000) {
    errors.push('timeWindowMs must be a number between 1000 and 3600000 (1 hour)');
  }

  return errors;
}

/**
 * Check if object is a valid WebSocket message
 */
export function isValidWSMessage(obj: any): boolean {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.type === 'string' &&
    obj.id.length > 0 &&
    obj.type.length > 0 &&
    obj.timestamp > 0
  );
}

/**
 * Validate heartbeat interval
 */
export function validateHeartbeatInterval(interval: number): boolean {
  return typeof interval === 'number' && interval >= 5000 && interval <= 300000; // 5 seconds to 5 minutes
}

/**
 * Validate session timeout
 */
export function validateSessionTimeout(timeout: number): boolean {
  return typeof timeout === 'number' && timeout >= 60000 && timeout <= 86400000; // 1 minute to 24 hours
}
