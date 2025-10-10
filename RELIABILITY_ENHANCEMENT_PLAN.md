# CleanSpace Pro - Reliability Enhancement Plan 🔄

**Date**: October 8, 2025
**Focus**: Enhanced Error Catching, Retries, Circuit Breakers, and Shadow Deployments
**Status**: DESIGN PHASE

---

## Executive Summary

CleanSpace Pro **already has excellent reliability infrastructure** with:

- ✅ Circuit Breakers
- ✅ Retry Policies with exponential backoff
- ✅ Shadow Deployment system
- ✅ Response Caching

This plan enhances the existing systems with:

1. **Advanced Error Catching & Classification**
2. **Intelligent Retry Strategies**
3. **Enhanced Circuit Breaker Patterns**
4. **Production Shadow Testing**
5. **Observability & Monitoring**

---

## Current State Analysis

### ✅ What We Have (Excellent Foundation)

**1. Circuit Breaker** (`src/utils/CircuitBreaker.js`)

- ✅ 3 states: CLOSED, OPEN, HALF_OPEN
- ✅ Failure threshold detection
- ✅ Auto-recovery with timeout
- ✅ Metrics tracking

**2. Retry Policies** (`src/utils/RetryPolicies.js`)

- ✅ Exponential backoff with jitter
- ✅ Retry budgets (rate limiting retries)
- ✅ Smart retry conditions (5xx, timeouts, network errors)
- ✅ 3 pre-configured policies (aggressive, standard, conservative)

**3. Shadow Deployment** (`src/utils/ShadowDeployment.js`)

- ✅ Non-blocking shadow execution
- ✅ Response comparison
- ✅ Performance tracking
- ✅ Database logging

**4. Response Caching** (`src/utils/ResponseCache.js`)

- ✅ Exact match + semantic similarity
- ✅ TTL-based expiration
- ✅ LRU eviction
- ✅ 80%+ cost savings

---

## Enhancement Areas

### Phase 1: Advanced Error Catching & Classification 🎯

#### 1.1 Error Taxonomy

**Current**: Basic error catching with generic messages

**Enhanced**: Structured error classification

```javascript
class ErrorClassifier {
  constructor() {
    this.errorTypes = {
      // Network layer
      NETWORK_TIMEOUT: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Connection timeout - retrying automatically",
      },
      NETWORK_REFUSED: {
        retryable: true,
        priority: "HIGH",
        userMessage: "Service temporarily unavailable - retrying",
      },

      // API layer
      API_RATE_LIMIT: {
        retryable: true,
        priority: "MEDIUM",
        userMessage: "Please wait a moment while we process your request",
        backoffMultiplier: 3, // Longer backoff for rate limits
      },
      API_AUTH_ERROR: {
        retryable: false,
        priority: "CRITICAL",
        userMessage: "Service configuration error - please contact support",
        alertAdmin: true,
      },
      API_INVALID_REQUEST: {
        retryable: false,
        priority: "LOW",
        userMessage: "Invalid request - please try rephrasing",
      },

      // Model layer
      MODEL_OVERLOADED: {
        retryable: true,
        priority: "HIGH",
        userMessage: "AI service is busy - retrying with backup model",
        fallbackStrategy: "USE_SMALLER_MODEL",
      },
      MODEL_CONTEXT_LENGTH: {
        retryable: false,
        priority: "MEDIUM",
        userMessage: "Message too long - please keep it concise",
        truncate: true,
      },

      // Business logic
      BOOKING_CONFLICT: {
        retryable: false,
        priority: "LOW",
        userMessage: "Time slot unavailable - please choose another time",
      },
      VALIDATION_ERROR: {
        retryable: false,
        priority: "LOW",
        userMessage: "Please provide valid information",
      },

      // System layer
      DATABASE_ERROR: {
        retryable: true,
        priority: "CRITICAL",
        userMessage: "Temporary system issue - retrying",
        alertAdmin: true,
      },
      CACHE_MISS: {
        retryable: false,
        priority: "LOW",
        userMessage: null, // Transparent to user
        fallback: "API_CALL",
      },
    };
  }

  classify(error) {
    // Network errors
    if (error.code === "ETIMEDOUT" || error.message?.includes("timeout")) {
      return this.errorTypes.NETWORK_TIMEOUT;
    }
    if (error.code === "ECONNREFUSED") {
      return this.errorTypes.NETWORK_REFUSED;
    }

    // HTTP status codes
    if (error.response?.status === 429) {
      return this.errorTypes.API_RATE_LIMIT;
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return this.errorTypes.API_AUTH_ERROR;
    }
    if (error.response?.status === 400) {
      return this.errorTypes.API_INVALID_REQUEST;
    }
    if (error.response?.status === 503) {
      return this.errorTypes.MODEL_OVERLOADED;
    }

    // Groq-specific errors
    if (error.message?.includes("context length")) {
      return this.errorTypes.MODEL_CONTEXT_LENGTH;
    }
    if (error.message?.includes("model_permission_blocked")) {
      return this.errorTypes.API_AUTH_ERROR;
    }

    // Database errors
    if (error.code === "SQLITE_ERROR") {
      return this.errorTypes.DATABASE_ERROR;
    }

    // Default to generic network error
    return {
      retryable: true,
      priority: "MEDIUM",
      userMessage: "Temporary issue - retrying",
      type: "UNKNOWN",
    };
  }

  shouldRetry(error) {
    const classification = this.classify(error);
    return classification.retryable;
  }

  getUserMessage(error) {
    const classification = this.classify(error);
    return classification.userMessage || "An error occurred - please try again";
  }

  shouldAlert(error) {
    const classification = this.classify(error);
    return classification.alertAdmin === true;
  }

  getFallbackStrategy(error) {
    const classification = this.classify(error);
    return classification.fallbackStrategy || null;
  }
}
```

#### 1.2 Error Context Enrichment

```javascript
class ErrorContext {
  static enrich(error, context) {
    return {
      // Original error
      originalError: error,
      message: error.message,
      stack: error.stack,

      // HTTP details
      statusCode: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,

      // Request details
      method: context.method,
      url: context.url,
      headers: context.headers,

      // Business context
      sessionId: context.sessionId,
      userId: context.userId,
      variant: context.variant,
      conversationId: context.conversationId,

      // Timing
      timestamp: new Date().toISOString(),
      requestStartTime: context.startTime,
      duration: Date.now() - context.startTime,

      // System state
      circuitBreakerState: context.circuitBreakerState,
      retryAttempt: context.retryAttempt,
      retryBudgetRemaining: context.retryBudgetRemaining,

      // Classification
      errorType: ErrorClassifier.classify(error).type,
      retryable: ErrorClassifier.shouldRetry(error),
      priority: ErrorClassifier.classify(error).priority,

      // Environment
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV,
    };
  }
}
```

---

### Phase 2: Intelligent Retry Strategies 🔄

#### 2.1 Adaptive Retry Delays

**Current**: Fixed exponential backoff

**Enhanced**: Context-aware backoff

```javascript
class AdaptiveRetryPolicy extends RetryPolicy {
  calculateDelay(attempt, error, context) {
    const baseDelay = super.calculateDelay(attempt);

    // Longer delays for rate limits
    if (error.response?.status === 429) {
      const retryAfter = error.response?.headers["retry-after"];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000; // Convert to ms
      }
      return baseDelay * 3; // 3x backoff for rate limits
    }

    // Shorter delays for transient network issues
    if (error.code === "ETIMEDOUT") {
      return baseDelay * 0.5; // Faster retry for timeouts
    }

    // Consider system load
    if (context.systemLoad > 0.8) {
      return baseDelay * 2; // Slower retries when system is loaded
    }

    return baseDelay;
  }

  shouldRetry(error, attempt, context) {
    // Use error classifier
    const classification = errorClassifier.classify(error);
    if (!classification.retryable) {
      return false;
    }

    // Don't retry if circuit breaker is open
    if (context.circuitBreakerState === "OPEN") {
      return false;
    }

    // Don't retry if we've exhausted budget
    if (!this.hasRetryBudget()) {
      return false;
    }

    // Don't retry client errors (except 429)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return error.response.status === 429;
    }

    return true;
  }
}
```

#### 2.2 Retry Strategies per Error Type

```javascript
const RetryStrategies = {
  // Fast retry for transient issues
  transient: new AdaptiveRetryPolicy({
    maxRetries: 5,
    initialDelay: 100,
    maxDelay: 2000,
    backoffMultiplier: 1.5,
  }),

  // Patient retry for rate limits
  rateLimited: new AdaptiveRetryPolicy({
    maxRetries: 3,
    initialDelay: 5000,
    maxDelay: 60000,
    backoffMultiplier: 3,
  }),

  // Aggressive retry for critical operations
  critical: new AdaptiveRetryPolicy({
    maxRetries: 10,
    initialDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2,
  }),

  // No retry for client errors
  noRetry: new AdaptiveRetryPolicy({
    maxRetries: 0,
  }),
};

function getRetryStrategy(error) {
  const classification = errorClassifier.classify(error);

  if (classification.type === "API_RATE_LIMIT") {
    return RetryStrategies.rateLimited;
  }
  if (classification.priority === "CRITICAL") {
    return RetryStrategies.critical;
  }
  if (!classification.retryable) {
    return RetryStrategies.noRetry;
  }

  return RetryStrategies.transient;
}
```

#### 2.3 Retry with Fallback Models

```javascript
class FallbackRetryPolicy extends AdaptiveRetryPolicy {
  constructor(options) {
    super(options);
    this.models = [
      "llama-3.1-8b-instant", // Primary (fast, cheap)
      "llama-3.1-70b-versatile", // Fallback 1 (better quality)
      "mixtral-8x7b-32768", // Fallback 2 (good balance)
    ];
    this.currentModelIndex = 0;
  }

  async executeWithFallback(fn, context) {
    let lastError;

    for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
      this.currentModelIndex = modelIndex;
      const model = this.models[modelIndex];

      try {
        console.log(`🔄 Trying model: ${model}`);
        const result = await this.executeWithRetry(() => fn(model), context);
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`❌ Model ${model} failed, trying fallback...`);

        if (modelIndex === this.models.length - 1) {
          // All models failed
          throw new Error(`All models failed. Last error: ${error.message}`);
        }
      }
    }

    throw lastError;
  }
}
```

---

### Phase 3: Enhanced Circuit Breaker Patterns 🔌

#### 3.1 Per-Model Circuit Breakers

**Current**: Single global circuit breaker

**Enhanced**: Circuit breaker per model/service

```javascript
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  getBreaker(serviceName) {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(
        serviceName,
        new CircuitBreaker({
          failureThreshold: 5,
          recoveryTimeout: 60000,
          monitoringPeriod: 10000,
        }),
      );
    }
    return this.breakers.get(serviceName);
  }

  async execute(serviceName, fn) {
    const breaker = this.getBreaker(serviceName);
    return breaker.execute(fn);
  }

  getStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getState();
    }
    return status;
  }
}

// Usage
const breakerManager = new CircuitBreakerManager();

// Separate breakers for each model
await breakerManager.execute("llama-3.1-8b", () => callModel8B());
await breakerManager.execute("llama-3.1-70b", () => callModel70B());
await breakerManager.execute("database", () => queryDB());
```

#### 3.2 Adaptive Thresholds

```javascript
class AdaptiveCircuitBreaker extends CircuitBreaker {
  constructor(options) {
    super(options);
    this.successWindow = [];
    this.windowSize = 100; // Track last 100 requests
  }

  onSuccess() {
    super.onSuccess();
    this.successWindow.push({ success: true, timestamp: Date.now() });
    this.trimWindow();
    this.adjustThreshold();
  }

  onFailure() {
    super.onFailure();
    this.successWindow.push({ success: false, timestamp: Date.now() });
    this.trimWindow();
    this.adjustThreshold();
  }

  trimWindow() {
    if (this.successWindow.length > this.windowSize) {
      this.successWindow.shift();
    }
  }

  adjustThreshold() {
    const successRate = this.calculateSuccessRate();

    // Lower threshold if service is unstable
    if (successRate < 0.7) {
      this.failureThreshold = Math.max(2, this.failureThreshold - 1);
    }
    // Raise threshold if service is stable
    else if (successRate > 0.95) {
      this.failureThreshold = Math.min(10, this.failureThreshold + 1);
    }
  }

  calculateSuccessRate() {
    if (this.successWindow.length === 0) return 1.0;

    const successes = this.successWindow.filter((r) => r.success).length;
    return successes / this.successWindow.length;
  }
}
```

#### 3.3 Circuit Breaker with Health Checks

```javascript
class HealthCheckCircuitBreaker extends AdaptiveCircuitBreaker {
  constructor(options) {
    super(options);
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30s
    this.healthCheckFn = options.healthCheckFn;
    this.startHealthChecks();
  }

  startHealthChecks() {
    setInterval(async () => {
      if (this.state === "OPEN") {
        try {
          await this.healthCheckFn();
          console.log("🟢 Health check passed - closing circuit");
          this.close();
        } catch (error) {
          console.log("🔴 Health check failed - keeping circuit open");
        }
      }
    }, this.healthCheckInterval);
  }

  async healthCheck() {
    // Simple health check
    return fetch("/api/health").then((r) => r.json());
  }
}
```

---

### Phase 4: Production Shadow Testing 🌓

#### 4.1 Gradual Shadow Rollout

**Current**: All-or-nothing shadow deployment

**Enhanced**: Gradual percentage-based rollout

```javascript
class GradualShadowDeployment extends ShadowDeployment {
  constructor() {
    super();
    this.rolloutSchedule = [];
  }

  scheduleGradualRollout(shadowVariant, schedule) {
    this.shadowVariant = shadowVariant;
    this.rolloutSchedule = schedule;
    // Schedule: [{ time: '2025-10-09T10:00:00Z', percent: 10 }, ...]

    console.log(`📅 Scheduled gradual rollout for ${shadowVariant}:`);
    schedule.forEach((s) => {
      console.log(`   ${s.time}: ${s.percent}% traffic`);
    });

    this.startRollout();
  }

  startRollout() {
    const checkInterval = setInterval(() => {
      const now = new Date();

      for (const step of this.rolloutSchedule) {
        const stepTime = new Date(step.time);

        if (now >= stepTime && this.shadowTrafficPercent !== step.percent) {
          this.shadowTrafficPercent = step.percent;
          console.log(`🌒 Shadow traffic increased to ${step.percent}%`);

          // Auto-rollback if error rate too high
          if (this.getMetrics().shadowErrorRate > 5) {
            console.error("⚠️ Shadow error rate > 5% - rolling back!");
            this.disable();
            clearInterval(checkInterval);
          }
        }
      }
    }, 60000); // Check every minute
  }
}

// Usage
const gradualShadow = new GradualShadowDeployment();
gradualShadow.scheduleGradualRollout("professional", [
  { time: "2025-10-09T10:00:00Z", percent: 10 },
  { time: "2025-10-09T12:00:00Z", percent: 25 },
  { time: "2025-10-09T14:00:00Z", percent: 50 },
  { time: "2025-10-09T16:00:00Z", percent: 100 },
]);
```

#### 4.2 Shadow with Canary Analysis

```javascript
class CanaryShadowDeployment extends GradualShadowDeployment {
  async analyzeCanaryMetrics() {
    const report = await this.getComparisonReport();

    const analysis = {
      safe: true,
      concerns: [],
      metrics: {
        errorRate: this.getMetrics().shadowErrorRate,
        responseDifferenceRate: this.getMetrics().responseDifferenceRate,
        avgPerformanceDelta: report.avgPerformanceDelta,
      },
    };

    // Check error rate
    if (analysis.metrics.errorRate > 5) {
      analysis.safe = false;
      analysis.concerns.push({
        type: "HIGH_ERROR_RATE",
        severity: "CRITICAL",
        message: `Shadow error rate ${analysis.metrics.errorRate.toFixed(1)}% exceeds 5% threshold`,
      });
    }

    // Check response differences
    if (analysis.metrics.responseDifferenceRate > 30) {
      analysis.safe = false;
      analysis.concerns.push({
        type: "HIGH_DIFFERENCE_RATE",
        severity: "HIGH",
        message: `${analysis.metrics.responseDifferenceRate.toFixed(1)}% of responses differ significantly`,
      });
    }

    // Check performance regression
    if (analysis.metrics.avgPerformanceDelta > 500) {
      analysis.safe = false;
      analysis.concerns.push({
        type: "PERFORMANCE_REGRESSION",
        severity: "MEDIUM",
        message: `Shadow variant is ${analysis.metrics.avgPerformanceDelta}ms slower`,
      });
    }

    return analysis;
  }

  async shouldContinueRollout() {
    const analysis = await this.analyzeCanaryMetrics();

    if (!analysis.safe) {
      console.error("🛑 Canary analysis failed - halting rollout");
      analysis.concerns.forEach((c) => {
        console.error(`   ${c.severity}: ${c.message}`);
      });
      return false;
    }

    console.log("✅ Canary analysis passed - continuing rollout");
    return true;
  }
}
```

#### 4.3 Shadow with A/B Statistical Testing

```javascript
class ABTestShadowDeployment extends CanaryShadowDeployment {
  async performStatisticalTest() {
    const report = await this.getComparisonReport();
    const comparisons = await this.getDetailedComparisons();

    // Collect success metrics
    const primarySuccesses = comparisons.filter(
      (c) => c.primary_action === "book" || c.primary_action === "continue",
    ).length;

    const shadowSuccesses = comparisons.filter(
      (c) => c.shadow_action === "book" || c.shadow_action === "continue",
    ).length;

    const n = comparisons.length;
    const p1 = primarySuccesses / n;
    const p2 = shadowSuccesses / n;

    // Simple z-test for proportions
    const pooledP = (primarySuccesses + shadowSuccesses) / (2 * n);
    const se = Math.sqrt((2 * pooledP * (1 - pooledP)) / n);
    const zScore = (p2 - p1) / se;
    const pValue = this.calculatePValue(zScore);

    return {
      primarySuccessRate: p1,
      shadowSuccessRate: p2,
      improvement: ((p2 - p1) / p1) * 100,
      zScore,
      pValue,
      statisticallySignificant: pValue < 0.05,
      winner: p2 > p1 ? "shadow" : "primary",
      confidence: 1 - pValue,
    };
  }

  calculatePValue(zScore) {
    // Approximate p-value calculation
    const t = 1 / (1 + 0.2316419 * Math.abs(zScore));
    const d = 0.3989423 * Math.exp((-zScore * zScore) / 2);
    const probability =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return zScore > 0 ? probability : 1 - probability;
  }
}
```

---

### Phase 5: Observability & Monitoring 📊

#### 5.1 Structured Logging

```javascript
class StructuredLogger {
  log(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata,
      // Automatic context
      sessionId: this.getCurrentSessionId(),
      userId: this.getCurrentUserId(),
      requestId: this.getCurrentRequestId(),
      // System context
      service: "cleanspace-ai",
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version,
    };

    // PII redaction
    const safe = this.redactPII(entry);

    // Output
    console.log(JSON.stringify(safe));

    // Send to external logging service
    this.sendToLogAggregator(safe);
  }

  error(message, error, metadata = {}) {
    this.log("ERROR", message, {
      ...metadata,
      error: {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name,
        ...ErrorContext.enrich(error, metadata),
      },
    });
  }

  retry(attempt, maxRetries, error, metadata = {}) {
    this.log("WARN", `Retry attempt ${attempt}/${maxRetries}`, {
      ...metadata,
      retry: {
        attempt,
        maxRetries,
        error: error.message,
        nextDelay: metadata.nextDelay,
      },
    });
  }

  circuitBreaker(state, metadata = {}) {
    const level = state === "OPEN" ? "ERROR" : "INFO";
    this.log(level, `Circuit breaker ${state}`, {
      ...metadata,
      circuitBreaker: {
        state,
        failures: metadata.failures,
        threshold: metadata.threshold,
      },
    });
  }
}
```

#### 5.2 Real-Time Metrics Dashboard API

```javascript
// New endpoint: GET /api/reliability/metrics
router.get("/metrics", async (req, res) => {
  const metrics = {
    circuitBreakers: breakerManager.getStatus(),

    retryPolicies: {
      standard: RetryPolicies.standard.getMetrics(),
      aggressive: RetryPolicies.aggressive.getMetrics(),
      conservative: RetryPolicies.conservative.getMetrics(),
    },

    shadowDeployment: shadowDeployment.getMetrics(),

    errorRates: {
      last5Minutes: await getErrorRate(5 * 60 * 1000),
      last1Hour: await getErrorRate(60 * 60 * 1000),
      last24Hours: await getErrorRate(24 * 60 * 60 * 1000),
    },

    performance: {
      p50: await getLatencyPercentile(50),
      p95: await getLatencyPercentile(95),
      p99: await getLatencyPercentile(99),
    },
  };

  res.json(metrics);
});

// New endpoint: GET /api/reliability/health
router.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    checks: {
      database: await checkDatabase(),
      groqAPI: await checkGroqAPI(),
      cache: await checkCache(),
    },
    circuitBreakers: breakerManager.getStatus(),
  };

  // Overall health based on circuit breakers
  const hasOpenCircuits = Object.values(health.circuitBreakers).some(
    (b) => b.state === "OPEN",
  );

  if (hasOpenCircuits) {
    health.status = "degraded";
  }

  res.json(health);
});
```

---

## Implementation Roadmap

### Week 1: Error Handling

- [ ] Implement `ErrorClassifier` with error taxonomy
- [ ] Add `ErrorContext` enrichment
- [ ] Update existing error handling to use classification
- [ ] Add structured logging
- [ ] Unit tests for error classification

### Week 2: Intelligent Retries

- [ ] Implement `AdaptiveRetryPolicy`
- [ ] Add fallback model retry strategy
- [ ] Implement retry strategy selection per error type
- [ ] Integration tests for retry scenarios
- [ ] Update SchedulingAgent to use adaptive retries

### Week 3: Circuit Breaker Enhancements

- [ ] Implement `CircuitBreakerManager` (per-service breakers)
- [ ] Add `AdaptiveCircuitBreaker` with dynamic thresholds
- [ ] Implement health check circuit breaker
- [ ] Add circuit breaker metrics API
- [ ] Load testing to validate thresholds

### Week 4: Shadow Deployment Enhancements

- [ ] Implement `GradualShadowDeployment`
- [ ] Add `CanaryShadowDeployment` with metrics analysis
- [ ] Implement A/B statistical testing
- [ ] Create shadow deployment dashboard
- [ ] Documentation & runbooks

---

## Testing Strategy

### Chaos Engineering Tests

```javascript
describe("Reliability under chaos", () => {
  it("handles API failures gracefully", async () => {
    // Simulate API returning 500 errors
    mockGroqAPI.mockRejectedValue(new Error("500 Internal Server Error"));

    const result = await agent.chat(sessionId, message);

    // Should still respond (cached or fallback)
    expect(result).toBeDefined();
    expect(result.message).toContain("temporarily unavailable");
  });

  it("retries with exponential backoff", async () => {
    const delays = [];
    mockGroqAPI
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce({ message: "success" });

    await agent.chat(sessionId, message);

    // Verify exponential delays: ~1s, ~2s
    expect(delays[0]).toBeGreaterThan(900);
    expect(delays[1]).toBeGreaterThan(1900);
  });

  it("opens circuit breaker after threshold", async () => {
    // Fail 5 times
    for (let i = 0; i < 5; i++) {
      await expect(agent.chat(sessionId, message)).rejects.toThrow();
    }

    // Circuit should be open
    const state = circuitBreaker.getState();
    expect(state.state).toBe("OPEN");

    // Next request should fail fast
    const start = Date.now();
    await expect(agent.chat(sessionId, message)).rejects.toThrow(
      "Circuit breaker is OPEN",
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Fast failure
  });

  it("falls back to cached response when API fails", async () => {
    // Prime cache
    await agent.chat(sessionId, "Hello");

    // Break API
    mockGroqAPI.mockRejectedValue(new Error("API down"));

    // Should return cached response
    const result = await agent.chat(sessionId, "Hello");
    expect(result).toBeDefined();
    expect(result.fromCache).toBe(true);
  });
});
```

---

## Metrics & SLOs

### Service Level Objectives

**Availability**: 99.9% uptime

- Allow 43 minutes downtime per month
- Circuit breakers prevent cascading failures
- Graceful degradation with cache

**Latency**:

- P50 < 500ms
- P95 < 2000ms
- P99 < 5000ms

**Success Rate**: > 98%

- Includes retries
- Excludes user errors (4xx)

**Error Budget**:

- 0.1% error rate = ~720 errors per month (at 1M requests)
- Burn rate alerts when > 10x expected

---

## Cost Analysis

### Enhanced Reliability Cost

**Additional API Calls from Retries:**

- Average retry rate: 3% of requests
- Cost per retry: $0.000130 (8B model)
- At 10,000 requests/month: $3.90/month

**Shadow Deployment:**

- 100% traffic shadowing
- Doubles API costs temporarily
- During 1-week test: ~$30 (one-time)

**Total Added Cost:**

- Retries: $3.90/month
- Monitoring: $0 (self-hosted)
- Shadow testing: $30 one-time

**ROI:**

- Prevented downtime: >>> cost
- Improved UX: Priceless
- Earlier bug detection: Saves development time

---

## Success Metrics

### Before Enhancements

- Basic error handling
- Single retry strategy
- Global circuit breaker
- Manual shadow testing

### After Enhancements

- ✅ Classified error handling (10+ types)
- ✅ Adaptive retry strategies (5 strategies)
- ✅ Per-service circuit breakers
- ✅ Gradual shadow rollout with statistical testing
- ✅ Real-time reliability metrics
- ✅ Structured logging
- ✅ Automated health checks

---

## Conclusion

This plan enhances CleanSpace Pro's **already excellent** reliability infrastructure with:

✅ **Intelligent error classification** (10+ error types)
✅ **Adaptive retry strategies** (context-aware backoff)
✅ **Enhanced circuit breakers** (per-service, health checks)
✅ **Production shadow testing** (gradual rollout + A/B testing)
✅ **Comprehensive observability** (structured logs, metrics API)

**Cost**: < $5/month (mostly retries)
**Timeline**: 4 weeks
**Risk**: Low (backwards compatible, incremental rollout)

**Ready to implement!** 🚀

---

**Next Steps**:

1. Review & approve plan
2. Prioritize phases
3. Start with Week 1 (Error Handling)
4. Measure improvements with chaos testing
