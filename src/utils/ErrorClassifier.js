/**
 * ErrorClassifier - Structured error classification and handling
 *
 * Provides taxonomy-based error classification with:
 * - Retryability detection
 * - User-friendly messaging
 * - Alerting priorities
 * - Custom backoff multipliers
 */

export class ErrorClassifier {
  constructor() {
    this.errorTypes = {
      // Network errors
      NETWORK_TIMEOUT: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Connection timeout - retrying automatically",
        backoffMultiplier: 1,
        alertAdmin: false,
      },
      NETWORK_REFUSED: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Service temporarily unavailable - retrying",
        backoffMultiplier: 1,
        alertAdmin: false,
      },
      NETWORK_DNS: {
        retryable: true,
        priority: "CRITICAL",
        userMessage: "Network error - please check your connection",
        backoffMultiplier: 2,
        alertAdmin: true,
      },

      // API errors
      API_RATE_LIMIT: {
        retryable: true,
        priority: "MEDIUM",
        userMessage: "Please wait a moment while we process your request",
        backoffMultiplier: 3,
        alertAdmin: false,
      },
      API_AUTH_ERROR: {
        retryable: false,
        priority: "CRITICAL",
        userMessage: "Service configuration error - please contact support",
        backoffMultiplier: 1,
        alertAdmin: true,
      },
      API_INVALID_REQUEST: {
        retryable: false,
        priority: "LOW",
        userMessage: "Invalid request - please try rephrasing",
        backoffMultiplier: 1,
        alertAdmin: false,
      },
      API_SERVER_ERROR: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Server error - retrying your request",
        backoffMultiplier: 1.5,
        alertAdmin: true,
      },
      API_SERVICE_UNAVAILABLE: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Service temporarily down - retrying",
        backoffMultiplier: 2,
        alertAdmin: true,
      },

      // Circuit breaker errors
      CIRCUIT_OPEN: {
        retryable: false,
        priority: "HIGH",
        userMessage:
          "Service is temporarily unavailable - please try again soon",
        backoffMultiplier: 1,
        alertAdmin: true,
      },

      // Application errors
      VALIDATION_ERROR: {
        retryable: false,
        priority: "LOW",
        userMessage: "Please check your input and try again",
        backoffMultiplier: 1,
        alertAdmin: false,
      },
      DATABASE_ERROR: {
        retryable: true,
        priority: "CRITICAL",
        userMessage: "Database error - retrying",
        backoffMultiplier: 1.5,
        alertAdmin: true,
      },
      UNKNOWN_ERROR: {
        retryable: false,
        priority: "MEDIUM",
        userMessage: "An unexpected error occurred - please try again",
        backoffMultiplier: 1,
        alertAdmin: true,
      },
    };

    // Metrics
    this.metrics = {
      totalClassifications: 0,
      byType: {},
      byPriority: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    };
  }

  /**
   * Classify an error based on its type and properties
   * @param {Error} error - Error object to classify
   * @param {object} context - Additional context
   * @returns {object} Classification result
   */
  classify(error, context = {}) {
    this.metrics.totalClassifications++;

    let errorType = "UNKNOWN_ERROR";
    let httpStatus = context.httpStatus || error.response?.status;
    let errorCode = error.code;

    // Network errors
    if (errorCode === "ETIMEDOUT" || error.message.includes("timeout")) {
      errorType = "NETWORK_TIMEOUT";
    } else if (errorCode === "ECONNREFUSED") {
      errorType = "NETWORK_REFUSED";
    } else if (
      errorCode === "ENOTFOUND" ||
      errorCode === "EAI_AGAIN" ||
      errorCode === "ENETUNREACH"
    ) {
      errorType = "NETWORK_DNS";
    }

    // HTTP status codes
    else if (httpStatus) {
      if (httpStatus === 429) {
        errorType = "API_RATE_LIMIT";
      } else if (httpStatus === 401 || httpStatus === 403) {
        errorType = "API_AUTH_ERROR";
      } else if (httpStatus === 400 || httpStatus === 422) {
        errorType = "API_INVALID_REQUEST";
      } else if (httpStatus >= 500 && httpStatus < 600) {
        if (httpStatus === 503) {
          errorType = "API_SERVICE_UNAVAILABLE";
        } else {
          errorType = "API_SERVER_ERROR";
        }
      }
    }

    // Circuit breaker
    else if (error.message.includes("Circuit breaker is OPEN")) {
      errorType = "CIRCUIT_OPEN";
    }

    // Database errors
    else if (
      error.message.includes("database") ||
      error.message.includes("SQLITE")
    ) {
      errorType = "DATABASE_ERROR";
    }

    // Validation errors
    else if (
      error.message.includes("validation") ||
      error.name === "ValidationError"
    ) {
      errorType = "VALIDATION_ERROR";
    }

    const classification = this.errorTypes[errorType];

    // Update metrics
    this.metrics.byType[errorType] = (this.metrics.byType[errorType] || 0) + 1;
    this.metrics.byPriority[classification.priority]++;

    return {
      type: errorType,
      retryable: classification.retryable,
      priority: classification.priority,
      userMessage: classification.userMessage,
      backoffMultiplier: classification.backoffMultiplier,
      alertAdmin: classification.alertAdmin,
      originalError: {
        message: error.message,
        code: errorCode,
        httpStatus,
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @param {object} context - Additional context
   * @returns {boolean} Whether error is retryable
   */
  isRetryable(error, context = {}) {
    const classification = this.classify(error, context);
    return classification.retryable;
  }

  /**
   * Get user-friendly error message
   * @param {Error} error - Error object
   * @param {object} context - Additional context
   * @returns {string} User-friendly message
   */
  getUserMessage(error, context = {}) {
    const classification = this.classify(error, context);
    return classification.userMessage;
  }

  /**
   * Get backoff multiplier for retry logic
   * @param {Error} error - Error object
   * @param {object} context - Additional context
   * @returns {number} Backoff multiplier
   */
  getBackoffMultiplier(error, context = {}) {
    const classification = this.classify(error, context);
    return classification.backoffMultiplier;
  }

  /**
   * Check if admin should be alerted
   * @param {Error} error - Error object
   * @param {object} context - Additional context
   * @returns {boolean} Whether to alert admin
   */
  shouldAlertAdmin(error, context = {}) {
    const classification = this.classify(error, context);
    return classification.alertAdmin;
  }

  /**
   * Get metrics
   * @returns {object} Classification metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      retryableRate:
        this.metrics.totalClassifications > 0
          ? (Object.entries(this.metrics.byType)
              .filter(([type]) => this.errorTypes[type].retryable)
              .reduce((sum, [, count]) => sum + count, 0) /
              this.metrics.totalClassifications) *
            100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalClassifications: 0,
      byType: {},
      byPriority: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    };
  }
}

// Singleton instance
export const errorClassifier = new ErrorClassifier();
