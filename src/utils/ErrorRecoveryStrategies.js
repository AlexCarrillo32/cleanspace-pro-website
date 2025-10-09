/**
 * ErrorRecoveryStrategies - Fallback patterns and recovery strategies
 *
 * Provides intelligent fallback mechanisms when primary operations fail:
 * - Graceful degradation
 * - Cached responses
 * - Default/fallback values
 * - Alternative service endpoints
 */

import { errorClassifier } from "./ErrorClassifier.js";
import { safeLogger } from "./SafeLogger.js";

export class ErrorRecoveryStrategies {
  constructor() {
    this.fallbackResponses = new Map();
    this.metrics = {
      totalRecoveries: 0,
      byStrategy: {},
      successfulRecoveries: 0,
      failedRecoveries: 0,
    };
  }

  /**
   * Execute operation with fallback strategies
   * @param {Function} operation - Primary operation to execute
   * @param {object} options - Recovery options
   * @returns {Promise<object>} Operation result with recovery metadata
   */
  async executeWithFallback(operation, options = {}) {
    const {
      fallbackValue = null,
      useCachedResponse = true,
      cacheKey = null,
      degradedMode = false,
      context = {},
    } = options;

    this.metrics.totalRecoveries++;

    try {
      // Try primary operation
      const result = await operation();

      // Cache successful response if cache key provided
      if (cacheKey && useCachedResponse) {
        this.fallbackResponses.set(cacheKey, {
          response: result,
          timestamp: Date.now(),
          ttl: 300000, // 5 minutes
        });
      }

      return {
        success: true,
        data: result,
        strategy: "PRIMARY",
        metadata: {
          timestamp: new Date().toISOString(),
          context,
        },
      };
    } catch (error) {
      safeLogger.warn("Primary operation failed, attempting recovery", {
        error: error.message,
        context,
      });

      // Classify error
      const classification = errorClassifier.classify(error, context);

      // Try recovery strategies in order
      const strategies = [
        { name: "CACHED_RESPONSE", fn: () => this.tryCachedResponse(cacheKey) },
        {
          name: "DEGRADED_MODE",
          fn: () => this.tryDegradedMode(degradedMode, context),
        },
        {
          name: "FALLBACK_VALUE",
          fn: () => this.tryFallbackValue(fallbackValue),
        },
      ];

      for (const strategy of strategies) {
        try {
          const result = await strategy.fn();
          if (result !== null && result !== undefined) {
            this.metrics.successfulRecoveries++;
            this.metrics.byStrategy[strategy.name] =
              (this.metrics.byStrategy[strategy.name] || 0) + 1;

            safeLogger.info(`Recovered using ${strategy.name}`, {
              errorType: classification.type,
              context,
            });

            return {
              success: true,
              data: result,
              strategy: strategy.name,
              recovered: true,
              classification,
              metadata: {
                timestamp: new Date().toISOString(),
                originalError: error.message,
                context,
              },
            };
          }
        } catch (recoveryError) {
          // Continue to next strategy
          continue;
        }
      }

      // All recovery strategies failed
      this.metrics.failedRecoveries++;
      safeLogger.error("All recovery strategies failed", {
        errorType: classification.type,
        context,
      });

      return {
        success: false,
        data: null,
        strategy: "NONE",
        classification,
        metadata: {
          timestamp: new Date().toISOString(),
          originalError: error.message,
          userMessage: classification.userMessage,
          context,
        },
      };
    }
  }

  /**
   * Try to use cached response
   * @param {string} cacheKey - Cache key
   * @returns {any} Cached response or null
   */
  tryCachedResponse(cacheKey) {
    if (!cacheKey) return null;

    const cached = this.fallbackResponses.get(cacheKey);
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.fallbackResponses.delete(cacheKey);
      return null;
    }

    return cached.response;
  }

  /**
   * Try degraded mode operation
   * @param {Function|object} degradedMode - Degraded mode function or value
   * @param {object} context - Context
   * @returns {any} Degraded response or null
   */
  async tryDegradedMode(degradedMode, context) {
    if (!degradedMode) return null;

    if (typeof degradedMode === "function") {
      return await degradedMode(context);
    }

    return degradedMode;
  }

  /**
   * Try fallback value
   * @param {any} fallbackValue - Fallback value
   * @returns {any} Fallback value
   */
  tryFallbackValue(fallbackValue) {
    return fallbackValue;
  }

  /**
   * Execute with timeout and fallback
   * @param {Function} operation - Operation to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {object} fallbackOptions - Fallback options
   * @returns {Promise<object>} Operation result
   */
  async executeWithTimeout(operation, timeoutMs = 5000, fallbackOptions = {}) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return this.executeWithFallback(
      () => Promise.race([operation(), timeoutPromise]),
      fallbackOptions,
    );
  }

  /**
   * Execute with retry and fallback
   * @param {Function} operation - Operation to execute
   * @param {object} retryOptions - Retry options
   * @param {object} fallbackOptions - Fallback options
   * @returns {Promise<object>} Operation result
   */
  async executeWithRetryAndFallback(
    operation,
    retryOptions = {},
    fallbackOptions = {},
  ) {
    const { maxAttempts = 3, baseDelay = 1000 } = retryOptions;

    const retryOperation = async () => {
      let lastError;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;

          const classification = errorClassifier.classify(error);

          if (!classification.retryable || attempt === maxAttempts) {
            throw error;
          }

          // Calculate delay with backoff multiplier
          const delay =
            baseDelay *
            Math.pow(2, attempt - 1) *
            classification.backoffMultiplier;
          const jitter = Math.random() * 0.3 * delay;

          safeLogger.debug(`Retry attempt ${attempt}/${maxAttempts}`, {
            errorType: classification.type,
            delayMs: delay + jitter,
          });

          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
      }

      throw lastError;
    };

    return this.executeWithFallback(retryOperation, fallbackOptions);
  }

  /**
   * Create a default fallback response for chat operations
   * @param {string} message - Fallback message
   * @returns {object} Fallback response
   */
  static createChatFallback(
    message = "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
  ) {
    return {
      message,
      action: "error",
      extractedData: {},
      metadata: {
        fallback: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Get recovery metrics
   * @returns {object} Recovery metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      recoverySuccessRate:
        this.metrics.totalRecoveries > 0
          ? (this.metrics.successfulRecoveries / this.metrics.totalRecoveries) *
            100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRecoveries: 0,
      byStrategy: {},
      successfulRecoveries: 0,
      failedRecoveries: 0,
    };
  }

  /**
   * Clear all cached responses
   */
  clearCache() {
    this.fallbackResponses.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of this.fallbackResponses.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.fallbackResponses.delete(key);
      }
    }
  }
}

// Singleton instance
export const errorRecovery = new ErrorRecoveryStrategies();
