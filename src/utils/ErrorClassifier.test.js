/**
 * Unit tests for ErrorClassifier
 */

import { ErrorClassifier } from "./ErrorClassifier.js";

describe("ErrorClassifier", () => {
  let classifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe("classify", () => {
    it("classifies network timeout errors", () => {
      const error = new Error("Connection timeout");
      error.code = "ETIMEDOUT";

      const result = classifier.classify(error);

      expect(result.type).toBe("NETWORK_TIMEOUT");
      expect(result.retryable).toBe(true);
      expect(result.priority).toBe("HIGH");
      expect(result.userMessage).toContain("timeout");
    });

    it("classifies connection refused errors", () => {
      const error = new Error("Connection refused");
      error.code = "ECONNREFUSED";

      const result = classifier.classify(error);

      expect(result.type).toBe("NETWORK_REFUSED");
      expect(result.retryable).toBe(true);
    });

    it("classifies DNS errors", () => {
      const error = new Error("DNS lookup failed");
      error.code = "ENOTFOUND";

      const result = classifier.classify(error);

      expect(result.type).toBe("NETWORK_DNS");
      expect(result.priority).toBe("CRITICAL");
      expect(result.alertAdmin).toBe(true);
    });

    it("classifies rate limit errors (429)", () => {
      const error = new Error("Rate limited");
      const result = classifier.classify(error, { httpStatus: 429 });

      expect(result.type).toBe("API_RATE_LIMIT");
      expect(result.retryable).toBe(true);
      expect(result.backoffMultiplier).toBe(3);
    });

    it("classifies auth errors (401/403)", () => {
      const error = new Error("Unauthorized");
      const result = classifier.classify(error, { httpStatus: 401 });

      expect(result.type).toBe("API_AUTH_ERROR");
      expect(result.retryable).toBe(false);
      expect(result.alertAdmin).toBe(true);
    });

    it("classifies invalid request errors (400)", () => {
      const error = new Error("Bad request");
      const result = classifier.classify(error, { httpStatus: 400 });

      expect(result.type).toBe("API_INVALID_REQUEST");
      expect(result.retryable).toBe(false);
    });

    it("classifies server errors (500)", () => {
      const error = new Error("Internal server error");
      const result = classifier.classify(error, { httpStatus: 500 });

      expect(result.type).toBe("API_SERVER_ERROR");
      expect(result.retryable).toBe(true);
      expect(result.priority).toBe("HIGH");
    });

    it("classifies service unavailable errors (503)", () => {
      const error = new Error("Service unavailable");
      const result = classifier.classify(error, { httpStatus: 503 });

      expect(result.type).toBe("API_SERVICE_UNAVAILABLE");
      expect(result.backoffMultiplier).toBe(2);
    });

    it("classifies circuit breaker open errors", () => {
      const error = new Error("Circuit breaker is OPEN");

      const result = classifier.classify(error);

      expect(result.type).toBe("CIRCUIT_OPEN");
      expect(result.retryable).toBe(false);
      expect(result.alertAdmin).toBe(true);
    });

    it("classifies database errors", () => {
      const error = new Error("SQLITE_ERROR: database is locked");

      const result = classifier.classify(error);

      expect(result.type).toBe("DATABASE_ERROR");
      expect(result.retryable).toBe(true);
    });

    it("classifies validation errors", () => {
      const error = new Error("Validation failed");
      error.name = "ValidationError";

      const result = classifier.classify(error);

      expect(result.type).toBe("VALIDATION_ERROR");
      expect(result.retryable).toBe(false);
    });

    it("classifies unknown errors", () => {
      const error = new Error("Something weird happened");

      const result = classifier.classify(error);

      expect(result.type).toBe("UNKNOWN_ERROR");
      expect(result.alertAdmin).toBe(true);
    });

    it("includes original error details", () => {
      const error = new Error("Test error");
      error.code = "TEST_CODE";

      const result = classifier.classify(error, { httpStatus: 500 });

      expect(result.originalError.message).toBe("Test error");
      expect(result.originalError.code).toBe("TEST_CODE");
      expect(result.originalError.httpStatus).toBe(500);
    });

    it("includes timestamp", () => {
      const error = new Error("Test");
      const result = classifier.classify(error);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("isRetryable", () => {
    it("returns true for retryable errors", () => {
      const error = new Error("Timeout");
      error.code = "ETIMEDOUT";

      expect(classifier.isRetryable(error)).toBe(true);
    });

    it("returns false for non-retryable errors", () => {
      const error = new Error("Unauthorized");

      const result = classifier.isRetryable(error, { httpStatus: 401 });

      expect(result).toBe(false);
    });
  });

  describe("getUserMessage", () => {
    it("returns user-friendly message", () => {
      const error = new Error("ETIMEDOUT");
      error.code = "ETIMEDOUT";

      const message = classifier.getUserMessage(error);

      expect(message).toContain("timeout");
      expect(message).not.toContain("ETIMEDOUT");
    });
  });

  describe("getBackoffMultiplier", () => {
    it("returns backoff multiplier for rate limits", () => {
      const error = new Error("Rate limited");

      const multiplier = classifier.getBackoffMultiplier(error, {
        httpStatus: 429,
      });

      expect(multiplier).toBe(3);
    });

    it("returns default multiplier for standard errors", () => {
      const error = new Error("Timeout");
      error.code = "ETIMEDOUT";

      const multiplier = classifier.getBackoffMultiplier(error);

      expect(multiplier).toBe(1);
    });
  });

  describe("shouldAlertAdmin", () => {
    it("returns true for critical errors", () => {
      const error = new Error("DNS failed");
      error.code = "ENOTFOUND";

      expect(classifier.shouldAlertAdmin(error)).toBe(true);
    });

    it("returns false for low-priority errors", () => {
      const error = new Error("Bad request");

      expect(classifier.shouldAlertAdmin(error, { httpStatus: 400 })).toBe(
        false,
      );
    });
  });

  describe("metrics", () => {
    it("tracks total classifications", () => {
      const error = new Error("Test");

      classifier.classify(error);
      classifier.classify(error);

      const metrics = classifier.getMetrics();
      expect(metrics.totalClassifications).toBe(2);
    });

    it("tracks classifications by type", () => {
      const timeoutError = new Error("Timeout");
      timeoutError.code = "ETIMEDOUT";

      const authError = new Error("Unauthorized");

      classifier.classify(timeoutError);
      classifier.classify(timeoutError);
      classifier.classify(authError, { httpStatus: 401 });

      const metrics = classifier.getMetrics();
      expect(metrics.byType.NETWORK_TIMEOUT).toBe(2);
      expect(metrics.byType.API_AUTH_ERROR).toBe(1);
    });

    it("tracks classifications by priority", () => {
      classifier.classify(new Error("Test"), { httpStatus: 500 }); // HIGH
      classifier.classify(new Error("Test"), { httpStatus: 400 }); // LOW

      const metrics = classifier.getMetrics();
      expect(metrics.byPriority.HIGH).toBe(1);
      expect(metrics.byPriority.LOW).toBe(1);
    });

    it("calculates retryable rate", () => {
      const timeoutError = new Error("Timeout");
      timeoutError.code = "ETIMEDOUT";

      classifier.classify(timeoutError); // Retryable
      classifier.classify(new Error("Unauthorized"), { httpStatus: 401 }); // Not retryable
      classifier.classify(new Error("Server error"), { httpStatus: 500 }); // Retryable

      const metrics = classifier.getMetrics();
      expect(metrics.retryableRate).toBeCloseTo(66.67, 1);
    });

    it("resets metrics", () => {
      classifier.classify(new Error("Test"));
      classifier.resetMetrics();

      const metrics = classifier.getMetrics();
      expect(metrics.totalClassifications).toBe(0);
      expect(metrics.byType).toEqual({});
    });
  });
});
