/**
 * Unit tests for ErrorRecoveryStrategies
 */

import { ErrorRecoveryStrategies } from "./ErrorRecoveryStrategies.js";

describe("ErrorRecoveryStrategies", () => {
  let recovery;

  beforeEach(() => {
    recovery = new ErrorRecoveryStrategies();
  });

  describe("executeWithFallback", () => {
    it("returns successful result when operation succeeds", async () => {
      const operation = async () => ({ data: "success" });

      const result = await recovery.executeWithFallback(operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "success" });
      expect(result.strategy).toBe("PRIMARY");
    });

    it("uses fallback value when operation fails", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };

      const result = await recovery.executeWithFallback(operation, {
        fallbackValue: { data: "fallback" },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "fallback" });
      expect(result.strategy).toBe("FALLBACK_VALUE");
      expect(result.recovered).toBe(true);
    });

    it("caches successful responses", async () => {
      const operation = async () => ({ data: "cached" });

      await recovery.executeWithFallback(operation, {
        cacheKey: "test-key",
      });

      // Check cache was populated
      const cached = recovery.tryCachedResponse("test-key");
      expect(cached).toEqual({ data: "cached" });
    });

    it("uses cached response on failure", async () => {
      // First call succeeds and caches
      await recovery.executeWithFallback(async () => ({ data: "cached" }), {
        cacheKey: "test-key",
      });

      // Second call fails but uses cache
      const result = await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { cacheKey: "test-key" },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "cached" });
      expect(result.strategy).toBe("CACHED_RESPONSE");
    });

    it("uses degraded mode when provided", async () => {
      const degradedFn = async () => ({ data: "degraded" });

      const result = await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { degradedMode: degradedFn },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "degraded" });
      expect(result.strategy).toBe("DEGRADED_MODE");
    });

    it("uses degraded mode value when not a function", async () => {
      const result = await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { degradedMode: { data: "degraded-value" } },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "degraded-value" });
      expect(result.strategy).toBe("DEGRADED_MODE");
    });

    it("returns failure when all strategies fail", async () => {
      const result = await recovery.executeWithFallback(
        async () => {
          throw new Error("Test failure");
        },
        { fallbackValue: null },
      );

      expect(result.success).toBe(false);
      expect(result.strategy).toBe("NONE");
      expect(result.classification).toBeDefined();
    });

    it("includes metadata in result", async () => {
      const result = await recovery.executeWithFallback(
        async () => ({ data: "test" }),
        { context: { userId: "123" } },
      );

      expect(result.metadata.context).toEqual({ userId: "123" });
      expect(result.metadata.timestamp).toBeDefined();
    });
  });

  describe("tryCachedResponse", () => {
    it("returns null for non-existent cache key", () => {
      const result = recovery.tryCachedResponse("nonexistent");

      expect(result).toBeNull();
    });

    it("returns cached response within TTL", () => {
      recovery.fallbackResponses.set("test-key", {
        response: { data: "cached" },
        timestamp: Date.now(),
        ttl: 300000,
      });

      const result = recovery.tryCachedResponse("test-key");

      expect(result).toEqual({ data: "cached" });
    });

    it("returns null for expired cache", () => {
      recovery.fallbackResponses.set("test-key", {
        response: { data: "expired" },
        timestamp: Date.now() - 400000, // 400 seconds ago
        ttl: 300000, // 5 minute TTL
      });

      const result = recovery.tryCachedResponse("test-key");

      expect(result).toBeNull();
    });
  });

  describe("executeWithTimeout", () => {
    it("returns result when operation completes within timeout", async () => {
      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { data: "success" };
      };

      const result = await recovery.executeWithTimeout(operation, 100);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "success" });
    });

    it("uses fallback when operation times out", async () => {
      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { data: "late" };
      };

      const result = await recovery.executeWithTimeout(operation, 50, {
        fallbackValue: { data: "timeout-fallback" },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "timeout-fallback" });
    });
  });

  describe("executeWithRetryAndFallback", () => {
    it("succeeds on first attempt", async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        return { data: "success" };
      };

      const result = await recovery.executeWithRetryAndFallback(operation, {
        maxAttempts: 3,
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(1);
    });

    it("retries on retryable errors", async () => {
      let attempts = 0;
      const operation = (async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error("Timeout");
          error.code = "ETIMEDOUT";
          throw error;
        }
        return { data: "success-after-retries" };
      });

      const result = await recovery.executeWithRetryAndFallback(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it("does not retry non-retryable errors", async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        const error = new Error("Unauthorized");
        error.response = { status: 401 };
        throw error;
      };

      const result = await recovery.executeWithRetryAndFallback(
        operation,
        { maxAttempts: 3 },
        { fallbackValue: { data: "fallback" } },
      );

      expect(callCount).toBe(1);
      expect(result.strategy).toBe("FALLBACK_VALUE");
    });

    it("uses fallback after max retries", async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        const error = new Error("Timeout");
        error.code = "ETIMEDOUT";
        throw error;
      };

      const result = await recovery.executeWithRetryAndFallback(
        operation,
        { maxAttempts: 2, baseDelay: 10 },
        { fallbackValue: { data: "fallback" } },
      );

      expect(callCount).toBe(2);
      expect(result.data).toEqual({ data: "fallback" });
    });
  });

  describe("createChatFallback", () => {
    it("creates default fallback response", () => {
      const fallback = ErrorRecoveryStrategies.createChatFallback();

      expect(fallback.message).toContain("trouble processing");
      expect(fallback.action).toBe("error");
      expect(fallback.extractedData).toEqual({});
      expect(fallback.metadata.fallback).toBe(true);
    });

    it("creates fallback with custom message", () => {
      const fallback = ErrorRecoveryStrategies.createChatFallback(
        "Custom error message",
      );

      expect(fallback.message).toBe("Custom error message");
    });
  });

  describe("metrics", () => {
    it("tracks total recoveries", async () => {
      await recovery.executeWithFallback(async () => ({ data: "test" }));
      await recovery.executeWithFallback(async () => ({ data: "test" }));

      const metrics = recovery.getMetrics();
      expect(metrics.totalRecoveries).toBe(2);
    });

    it("tracks successful recoveries", async () => {
      await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { fallbackValue: { data: "recovered" } },
      );

      const metrics = recovery.getMetrics();
      expect(metrics.successfulRecoveries).toBe(1);
    });

    it("tracks failed recoveries", async () => {
      await recovery.executeWithFallback(async () => {
        throw new Error("Failed");
      });

      const metrics = recovery.getMetrics();
      expect(metrics.failedRecoveries).toBe(1);
    });

    it("tracks recoveries by strategy", async () => {
      await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { fallbackValue: { data: "fb1" } },
      );
      await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { fallbackValue: { data: "fb2" } },
      );

      const metrics = recovery.getMetrics();
      expect(metrics.byStrategy.FALLBACK_VALUE).toBe(2);
    });

    it("calculates recovery success rate", async () => {
      await recovery.executeWithFallback(
        async () => {
          throw new Error("Failed");
        },
        { fallbackValue: "recovered" },
      );
      await recovery.executeWithFallback(async () => {
        throw new Error("Failed");
      });

      const metrics = recovery.getMetrics();
      expect(metrics.recoverySuccessRate).toBe(50);
    });

    it("resets metrics", () => {
      recovery.metrics.totalRecoveries = 10;
      recovery.resetMetrics();

      const metrics = recovery.getMetrics();
      expect(metrics.totalRecoveries).toBe(0);
    });
  });

  describe("cache management", () => {
    it("clears all cache", () => {
      recovery.fallbackResponses.set("key1", { response: "data1" });
      recovery.fallbackResponses.set("key2", { response: "data2" });

      recovery.clearCache();

      expect(recovery.fallbackResponses.size).toBe(0);
    });

    it("clears expired cache entries", () => {
      recovery.fallbackResponses.set("valid", {
        response: "data",
        timestamp: Date.now(),
        ttl: 300000,
      });
      recovery.fallbackResponses.set("expired", {
        response: "old-data",
        timestamp: Date.now() - 400000,
        ttl: 300000,
      });

      recovery.clearExpiredCache();

      expect(recovery.fallbackResponses.has("valid")).toBe(true);
      expect(recovery.fallbackResponses.has("expired")).toBe(false);
    });
  });
});
