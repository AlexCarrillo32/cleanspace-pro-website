/**
 * Retry Policies with Exponential Backoff
 *
 * Implements resilient retry strategies for API calls with:
 * - Exponential backoff with jitter
 * - Retry budgets (limited retries per time window)
 * - Configurable retry conditions
 */

export class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 32000; // 32 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitterFactor = options.jitterFactor || 0.1;

    // Retry budget: max retries per time window
    this.retryBudget = options.retryBudget || 10;
    this.budgetWindow = options.budgetWindow || 60000; // 1 minute
    this.retryCount = 0;
    this.windowStart = Date.now();

    this.metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successAfterRetry: 0,
      exhaustedRetries: 0,
      budgetExceeded: 0,
    };
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry(fn, context = "operation") {
    let lastError;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      this.metrics.totalAttempts++;

      // Check retry budget
      if (!this.hasRetryBudget() && attempt > 0) {
        this.metrics.budgetExceeded++;
        console.error(`⛔ Retry budget exceeded for ${context}`);
        throw new Error(
          "Retry budget exceeded - too many retries in time window",
        );
      }

      try {
        const result = await fn();

        if (attempt > 0) {
          this.metrics.successAfterRetry++;
          console.log(`✅ ${context} succeeded after ${attempt} retries`);
        }

        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt > this.maxRetries) {
          this.metrics.exhaustedRetries++;
          console.error(
            `❌ ${context} failed after ${this.maxRetries} retries`,
          );
          throw error;
        }

        if (!this.shouldRetry(error)) {
          console.error(`❌ ${context} failed with non-retryable error`);
          throw error;
        }

        this.metrics.totalRetries++;
        this.consumeRetryBudget();

        const delay = this.calculateDelay(attempt);
        console.warn(
          `⚠️ ${context} failed (attempt ${attempt}/${this.maxRetries}) - retrying in ${delay}ms`,
        );
        console.warn(`   Error: ${error.message}`);

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = Math.min(
      this.initialDelay * Math.pow(this.backoffMultiplier, attempt - 1),
      this.maxDelay,
    );

    // Add jitter to prevent thundering herd
    const jitter =
      exponentialDelay * this.jitterFactor * (Math.random() - 0.5) * 2;
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Check if error is retryable
   */
  shouldRetry(error) {
    // Network errors - retry
    if (
      error.code === "ECONNREFUSED" ||
      error.code === "ENOTFOUND" ||
      error.code === "ETIMEDOUT"
    ) {
      return true;
    }

    // API rate limits - retry
    if (error.response?.status === 429) {
      return true;
    }

    // Server errors (5xx) - retry
    if (error.response?.status >= 500 && error.response?.status < 600) {
      return true;
    }

    // Client errors (4xx) except 429 - don't retry
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }

    // Timeout errors - retry
    if (error.message?.includes("timeout")) {
      return true;
    }

    // Default: retry
    return true;
  }

  /**
   * Check if retry budget is available
   */
  hasRetryBudget() {
    const now = Date.now();

    // Reset budget if window expired
    if (now - this.windowStart > this.budgetWindow) {
      this.retryCount = 0;
      this.windowStart = now;
    }

    return this.retryCount < this.retryBudget;
  }

  /**
   * Consume retry budget
   */
  consumeRetryBudget() {
    this.retryCount++;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      retryRate:
        this.metrics.totalAttempts > 0
          ? (this.metrics.totalRetries / this.metrics.totalAttempts) * 100
          : 0,
      successRate:
        this.metrics.totalRetries > 0
          ? (this.metrics.successAfterRetry / this.metrics.totalRetries) * 100
          : 100,
      currentBudget: {
        used: this.retryCount,
        available: this.retryBudget - this.retryCount,
        windowStart: this.windowStart,
      },
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successAfterRetry: 0,
      exhaustedRetries: 0,
      budgetExceeded: 0,
    };
  }
}

/**
 * Pre-configured retry policies
 */
export const RetryPolicies = {
  // Aggressive: Quick retries, good for transient failures
  aggressive: new RetryPolicy({
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 8000,
    backoffMultiplier: 1.5,
  }),

  // Standard: Balanced retry strategy
  standard: new RetryPolicy({
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 32000,
    backoffMultiplier: 2,
  }),

  // Conservative: Fewer retries, longer delays
  conservative: new RetryPolicy({
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 3,
  }),
};
