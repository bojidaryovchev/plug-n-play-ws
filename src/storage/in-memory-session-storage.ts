import { Session, SessionStorage } from '../types';

export class InMemorySessionStorage implements SessionStorage {
  private sessions: Map<string, Session> = new Map();

  async set(sessionId: string, session: Session): Promise<void> {
    this.sessions.set(sessionId, { ...session });
  }

  async get(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getActiveSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.isActive)
      .map(session => ({ ...session }));
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      this.sessions.set(sessionId, session);
    }
  }

  async cleanup(maxAge: number): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      this.sessions.delete(sessionId);
    }
  }

  // Additional utility methods
  getSessionCount(): number {
    return this.sessions.size;
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values())
      .filter(session => session.isActive).length;
  }

  clear(): void {
    this.sessions.clear();
  }
}
