import { InMemorySessionStorage } from '../storage/in-memory-session-storage';
import { Session } from '../types';

describe('InMemorySessionStorage', () => {
  let storage: InMemorySessionStorage;
  let mockSession: Session;

  beforeEach(() => {
    storage = new InMemorySessionStorage();
    mockSession = {
      id: 'test-session-1',
      connectionId: 'test-connection-1',
      metadata: { user: 'testuser' },
      lastActivity: Date.now(),
      isActive: true
    };
  });

  afterEach(() => {
    storage.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve a session', async () => {
      await storage.set(mockSession.id, mockSession);
      const retrieved = await storage.get(mockSession.id);
      
      expect(retrieved).toEqual(mockSession);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await storage.get('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a session', async () => {
      await storage.set(mockSession.id, mockSession);
      await storage.delete(mockSession.id);
      
      const retrieved = await storage.get(mockSession.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', async () => {
      const activeSession = { ...mockSession, id: 'active-1', isActive: true };
      const inactiveSession = { ...mockSession, id: 'inactive-1', isActive: false };

      await storage.set(activeSession.id, activeSession);
      await storage.set(inactiveSession.id, inactiveSession);

      const activeSessions = await storage.getActiveSessions();
      
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe('active-1');
    });
  });

  describe('updateLastActivity', () => {
    it('should update the last activity timestamp', async () => {
      await storage.set(mockSession.id, mockSession);
      
      const originalTime = mockSession.lastActivity;
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait a bit
      
      await storage.updateLastActivity(mockSession.id);
      
      const updated = await storage.get(mockSession.id);
      expect(updated?.lastActivity).toBeGreaterThan(originalTime);
    });
  });

  describe('cleanup', () => {
    it('should remove sessions older than maxAge', async () => {
      const oldSession = {
        ...mockSession,
        id: 'old-session',
        lastActivity: Date.now() - 10000 // 10 seconds ago
      };
      
      const newSession = {
        ...mockSession,
        id: 'new-session',
        lastActivity: Date.now()
      };

      await storage.set(oldSession.id, oldSession);
      await storage.set(newSession.id, newSession);

      // Cleanup sessions older than 5 seconds
      await storage.cleanup(5000);

      const oldRetrieved = await storage.get(oldSession.id);
      const newRetrieved = await storage.get(newSession.id);

      expect(oldRetrieved).toBeNull();
      expect(newRetrieved).not.toBeNull();
    });
  });

  describe('utility methods', () => {
    it('should return correct session count', async () => {
      expect(storage.getSessionCount()).toBe(0);
      
      await storage.set('session-1', { ...mockSession, id: 'session-1' });
      await storage.set('session-2', { ...mockSession, id: 'session-2' });
      
      expect(storage.getSessionCount()).toBe(2);
    });

    it('should return correct active session count', async () => {
      await storage.set('active-1', { ...mockSession, id: 'active-1', isActive: true });
      await storage.set('inactive-1', { ...mockSession, id: 'inactive-1', isActive: false });
      
      expect(storage.getActiveSessionCount()).toBe(1);
    });
  });
});
