/**
 * SessionManager - Manages in-memory sessions with TTL and automatic cleanup
 * Prevents memory leaks by expiring old sessions and enforcing size limits
 */
class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();
    this.ttl = options.ttl || 30 * 60 * 1000; // 30 minutes default
    this.maxSessions = options.maxSessions || 1000;
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.cleanupTimer = null;
    this.startCleanup();
  }

  /**
   * Set a session with TTL tracking
   */
  set(sessionId, data) {
    if (this.sessions.size >= this.maxSessions) {
      this.evictOldest();
    }

    this.sessions.set(sessionId, {
      data,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  /**
   * Get a session and update last accessed time
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
      return session.data;
    }
    return null;
  }

  /**
   * Check if session exists
   */
  has(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Delete a specific session
   */
  delete(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Remove expired sessions based on TTL
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccessed > this.ttl) {
        this.sessions.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `[SessionManager] Cleaned up ${removed} expired sessions. Active: ${this.sessions.size}`,
      );
    }

    return removed;
  }

  /**
   * Evict the oldest session when max limit is reached
   */
  evictOldest() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions.entries()) {
      if (session.lastAccessed < oldestTime) {
        oldestTime = session.lastAccessed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
      console.log(
        `[SessionManager] Evicted oldest session ${oldestId}. Active: ${this.sessions.size}`,
      );
    }
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Prevent cleanup timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get current session count
   */
  size() {
    return this.sessions.size;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const now = Date.now();
    let totalAge = 0;
    let oldestAge = 0;

    for (const session of this.sessions.values()) {
      const age = now - session.createdAt;
      totalAge += age;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      total: this.sessions.size,
      maxSessions: this.maxSessions,
      utilizationPercent: (this.sessions.size / this.maxSessions) * 100,
      averageAgeMs: this.sessions.size > 0 ? totalAge / this.sessions.size : 0,
      oldestAgeMs: oldestAge,
      ttl: this.ttl,
    };
  }

  /**
   * Clear all sessions
   */
  clear() {
    const count = this.sessions.size;
    this.sessions.clear();
    return count;
  }
}

export default SessionManager;
