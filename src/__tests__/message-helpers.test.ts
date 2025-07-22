import {
  generateMessageId,
  createUserMessage,
  createPingMessage,
  createPongMessage,
  createErrorMessage,
  isUserMessage,
  isPingMessage,
  isPongMessage,
  isErrorMessage,
  parseWSMessage,
  MessageRateLimiter
} from '../utils/message-helpers';

describe('Message Helpers', () => {
  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('message creators', () => {
    it('should create user message', () => {
      const data = { text: 'Hello, World!' };
      const message = createUserMessage(data);
      
      expect(message.type).toBe('message');
      expect(message.data).toEqual(data);
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should create ping message', () => {
      const message = createPingMessage();
      
      expect(message.type).toBe('ping');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should create pong message', () => {
      const message = createPongMessage();
      
      expect(message.type).toBe('pong');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should create error message', () => {
      const error = 'Test error';
      const code = 500;
      const message = createErrorMessage(error, code);
      
      expect(message.type).toBe('error');
      expect(message.error).toBe(error);
      expect(message.code).toBe(code);
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });
  });

  describe('type guards', () => {
    it('should identify user messages', () => {
      const userMessage = createUserMessage({ text: 'test' });
      const pingMessage = createPingMessage();
      
      expect(isUserMessage(userMessage)).toBe(true);
      expect(isUserMessage(pingMessage)).toBe(false);
    });

    it('should identify ping messages', () => {
      const pingMessage = createPingMessage();
      const userMessage = createUserMessage({ text: 'test' });
      
      expect(isPingMessage(pingMessage)).toBe(true);
      expect(isPingMessage(userMessage)).toBe(false);
    });

    it('should identify pong messages', () => {
      const pongMessage = createPongMessage();
      const userMessage = createUserMessage({ text: 'test' });
      
      expect(isPongMessage(pongMessage)).toBe(true);
      expect(isPongMessage(userMessage)).toBe(false);
    });

    it('should identify error messages', () => {
      const errorMessage = createErrorMessage('test error');
      const userMessage = createUserMessage({ text: 'test' });
      
      expect(isErrorMessage(errorMessage)).toBe(true);
      expect(isErrorMessage(userMessage)).toBe(false);
    });
  });

  describe('parseWSMessage', () => {
    it('should parse valid WebSocket message', () => {
      const originalMessage = createUserMessage({ text: 'test' });
      const serialized = JSON.stringify(originalMessage);
      
      const parsed = parseWSMessage(serialized);
      
      expect(parsed).toEqual(originalMessage);
    });

    it('should return null for invalid JSON', () => {
      const parsed = parseWSMessage('invalid json');
      expect(parsed).toBeNull();
    });

    it('should return null for message without required fields', () => {
      const invalidMessage = JSON.stringify({ text: 'missing required fields' });
      const parsed = parseWSMessage(invalidMessage);
      expect(parsed).toBeNull();
    });
  });
});

describe('MessageRateLimiter', () => {
  let rateLimiter: MessageRateLimiter;

  beforeEach(() => {
    rateLimiter = new MessageRateLimiter(3, 1000); // 3 messages per second
  });

  it('should allow messages under the limit', () => {
    expect(rateLimiter.isAllowed('user1')).toBe(true);
    expect(rateLimiter.isAllowed('user1')).toBe(true);
    expect(rateLimiter.isAllowed('user1')).toBe(true);
  });

  it('should reject messages over the limit', () => {
    // Use up the limit
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    
    // This should be rejected
    expect(rateLimiter.isAllowed('user1')).toBe(false);
  });

  it('should track different users separately', () => {
    // User1 uses up their limit
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    
    // User2 should still be allowed
    expect(rateLimiter.isAllowed('user2')).toBe(true);
  });

  it('should return correct remaining count', () => {
    expect(rateLimiter.getRemaining('user1')).toBe(3);
    
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.getRemaining('user1')).toBe(2);
    
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.getRemaining('user1')).toBe(1);
  });

  it('should reset after time window', async () => {
    const shortLimiter = new MessageRateLimiter(1, 100); // 1 message per 100ms
    
    // Use up the limit
    expect(shortLimiter.isAllowed('user1')).toBe(true);
    expect(shortLimiter.isAllowed('user1')).toBe(false);
    
    // Wait for reset
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should be allowed again
    expect(shortLimiter.isAllowed('user1')).toBe(true);
  });

  it('should cleanup old records', () => {
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user2');
    
    // Manually call cleanup (in real usage this would be called periodically)
    rateLimiter.cleanup();
    
    // Should still work normally
    expect(rateLimiter.isAllowed('user3')).toBe(true);
  });
});
