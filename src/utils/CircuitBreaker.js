/**
 * Circuit Breaker Pattern
 *
 * Protects Groq API from cascading failures by:
 * - Opening circuit after threshold failures
 * - Half-opening after timeout for testing
 * - Closing when service recovers
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds

    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpens: 0,
      circuitCloses: 0,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    this.metrics.totalRequests++;

    // Check if circuit is OPEN
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          "Circuit breaker is OPEN - service temporarily unavailable",
        );
      }
      // Try half-open
      this.state = "HALF_OPEN";
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

  onSuccess() {
    this.failures = 0;
    this.successes++;
    this.metrics.totalSuccesses++;

    if (this.state === "HALF_OPEN") {
      this.close();
    }
  }

  onFailure() {
    this.failures++;
    this.metrics.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.open();
    }
  }

  open() {
    this.state = "OPEN";
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    this.metrics.circuitOpens++;
    console.error(
      `🔴 Circuit breaker OPENED - too many failures (${this.failures}/${this.failureThreshold})`,
    );
    console.log(
      `   Will retry at ${new Date(this.nextAttemptTime).toISOString()}`,
    );
  }

  close() {
    this.state = "CLOSED";
    this.failures = 0;
    this.metrics.circuitCloses++;
    console.log("🟢 Circuit breaker CLOSED - service recovered");
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      metrics: this.metrics,
    };
  }

  reset() {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}
