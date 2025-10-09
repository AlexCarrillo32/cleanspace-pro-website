/**
 * Enhanced Circuit Breaker Pattern
 *
 * Protects services from cascading failures with:
 * - Adaptive failure thresholds based on error rate
 * - Exponential backoff for recovery attempts
 * - Health check probes
 * - Self-healing capabilities
 * - Comprehensive metrics
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.adaptiveThreshold = options.adaptiveThreshold !== false; // Enable by default
    this.healthCheckFn = options.healthCheckFn || null;
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds

    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.consecutiveFailures = 0;
    this.recentRequests = []; // Sliding window for adaptive threshold

    // Exponential backoff state
    this.backoffMultiplier = 1;
    this.maxBackoffMultiplier = 8;

    // Health check state
    this.healthCheckTimer = null;
    this.lastHealthCheck = null;
    this.lastHealthCheckResult = null;

    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpens: 0,
      circuitCloses: 0,
      halfOpens: 0,
      adaptiveThresholdChanges: 0,
      healthChecks: 0,
      healthCheckFailures: 0,
    };

    // Start health check if enabled
    if (this.healthCheckFn) {
      this.startHealthCheck();
    }
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    this.metrics.totalRequests++;

    // Update sliding window
    this.updateSlidingWindow();

    // Check if circuit is OPEN
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          "Circuit breaker is OPEN - service temporarily unavailable",
        );
      }
      // Try half-open
      this.state = "HALF_OPEN";
      this.metrics.halfOpens++;
      console.log("🔶 Circuit breaker: HALF_OPEN - testing service");
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Update sliding window for adaptive threshold
   */
  updateSlidingWindow() {
    const now = Date.now();
    const windowStart = now - this.monitoringPeriod;

    // Remove old entries
    this.recentRequests = this.recentRequests.filter(
      (req) => req.timestamp > windowStart,
    );
  }

  /**
   * Calculate current error rate
   * @returns {number} Error rate as percentage
   */
  getErrorRate() {
    if (this.recentRequests.length === 0) return 0;

    const failures = this.recentRequests.filter((req) => req.failed).length;
    return (failures / this.recentRequests.length) * 100;
  }

  /**
   * Get adaptive failure threshold
   * @returns {number} Current failure threshold
   */
  getAdaptiveThreshold() {
    if (!this.adaptiveThreshold) {
      return this.failureThreshold;
    }

    const errorRate = this.getErrorRate();

    // If error rate is high (>30%), lower threshold to open faster
    if (errorRate > 30) {
      this.metrics.adaptiveThresholdChanges++;
      return Math.max(2, Math.floor(this.failureThreshold * 0.5));
    }

    // If error rate is moderate (10-30%), slightly lower threshold
    if (errorRate > 10) {
      this.metrics.adaptiveThresholdChanges++;
      return Math.max(3, Math.floor(this.failureThreshold * 0.7));
    }

    // Normal operation - use full threshold
    return this.failureThreshold;
  }

  onSuccess() {
    this.failures = 0;
    this.successes++;
    this.consecutiveFailures = 0;
    this.metrics.totalSuccesses++;

    // Track in sliding window
    this.recentRequests.push({
      timestamp: Date.now(),
      failed: false,
    });

    // Reset backoff on success
    this.backoffMultiplier = 1;

    if (this.state === "HALF_OPEN") {
      this.close();
    }
  }

  onFailure() {
    this.failures++;
    this.consecutiveFailures++;
    this.metrics.totalFailures++;
    this.lastFailureTime = Date.now();

    // Track in sliding window
    this.recentRequests.push({
      timestamp: Date.now(),
      failed: true,
    });

    // Use adaptive threshold
    const currentThreshold = this.getAdaptiveThreshold();

    if (this.failures >= currentThreshold) {
      this.open();
    }
  }

  open() {
    this.state = "OPEN";

    // Apply exponential backoff
    const backoffTimeout = this.recoveryTimeout * this.backoffMultiplier;
    this.nextAttemptTime = Date.now() + backoffTimeout;

    // Increase backoff for next time (if this fails again)
    this.backoffMultiplier = Math.min(
      this.backoffMultiplier * 2,
      this.maxBackoffMultiplier,
    );

    this.metrics.circuitOpens++;

    const currentThreshold = this.getAdaptiveThreshold();
    console.error(
      `🔴 Circuit breaker OPENED - too many failures (${this.failures}/${currentThreshold}, error rate: ${this.getErrorRate().toFixed(1)}%)`,
    );
    console.log(
      `   Backoff: ${backoffTimeout}ms (${this.backoffMultiplier}x), retry at ${new Date(this.nextAttemptTime).toISOString()}`,
    );
  }

  close() {
    this.state = "CLOSED";
    this.failures = 0;
    this.consecutiveFailures = 0;
    this.backoffMultiplier = 1;
    this.metrics.circuitCloses++;
    console.log("🟢 Circuit breaker CLOSED - service recovered");
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    if (!this.healthCheckFn) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    if (!this.healthCheckFn) return;

    this.metrics.healthChecks++;
    this.lastHealthCheck = Date.now();

    try {
      const result = await this.healthCheckFn();
      this.lastHealthCheckResult = {
        healthy: true,
        timestamp: this.lastHealthCheck,
        details: result,
      };

      // If circuit is open and health check passes, try to recover
      if (this.state === "OPEN" && this.consecutiveFailures === 0) {
        console.log(
          "🔄 Health check passed while circuit OPEN - attempting recovery",
        );
        this.state = "HALF_OPEN";
        this.metrics.halfOpens++;
      }
    } catch (error) {
      this.metrics.healthCheckFailures++;
      this.lastHealthCheckResult = {
        healthy: false,
        timestamp: this.lastHealthCheck,
        error: error.message,
      };
    }
  }

  /**
   * Get health status
   * @returns {object} Health status
   */
  getHealthStatus() {
    return {
      healthy: this.state === "CLOSED",
      state: this.state,
      errorRate: this.getErrorRate(),
      consecutiveFailures: this.consecutiveFailures,
      lastHealthCheck: this.lastHealthCheckResult,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      errorRate: this.getErrorRate(),
      currentThreshold: this.getAdaptiveThreshold(),
      backoffMultiplier: this.backoffMultiplier,
      healthStatus: this.getHealthStatus(),
      metrics: this.metrics,
    };
  }

  reset() {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.backoffMultiplier = 1;
    this.recentRequests = [];
  }

  /**
   * Cleanup - stop health checks
   */
  destroy() {
    this.stopHealthCheck();
  }
}
