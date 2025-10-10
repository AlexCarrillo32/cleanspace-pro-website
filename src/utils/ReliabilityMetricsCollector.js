/**
 * ReliabilityMetricsCollector - Aggregates reliability metrics
 *
 * Collects and aggregates metrics from:
 * - ErrorClassifier
 * - ErrorRecoveryStrategies
 * - CircuitBreaker
 * - RetryPolicies
 *
 * Provides real-time monitoring and alerting for reliability issues.
 */

export class ReliabilityMetricsCollector {
  constructor() {
    this.alerts = [];
    this.maxAlerts = 100;

    // Thresholds for alerting
    this.thresholds = {
      errorRate: 15, // Alert if >15% requests fail
      recoveryRate: 50, // Alert if <50% recoveries succeed
      circuitOpenDuration: 300000, // Alert if circuit open > 5 minutes
      retryFailureRate: 30, // Alert if >30% retries fail
    };

    // Time windows
    this.windows = {
      realtime: 60000, // 1 minute
      short: 300000, // 5 minutes
      medium: 3600000, // 1 hour
    };

    this.metrics = {
      timestamp: Date.now(),
      errors: {
        total: 0,
        byType: {},
        byPriority: {},
        retryableRate: 0,
      },
      recovery: {
        total: 0,
        successful: 0,
        failed: 0,
        byStrategy: {},
      },
      circuitBreaker: {
        state: "CLOSED",
        opens: 0,
        closes: 0,
        errorRate: 0,
      },
    };
  }

  /**
   * Collect metrics from all reliability systems
   * @param {object} sources - Metric sources
   * @returns {object} Aggregated metrics
   */
  collect(sources = {}) {
    const collected = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...this.collectErrorMetrics(sources.errorClassifier),
      ...this.collectRecoveryMetrics(sources.errorRecovery),
      ...this.collectCircuitBreakerMetrics(sources.circuitBreaker),
      alerts: this.getRecentAlerts(10),
    };

    // Check for alert conditions
    this.checkAlertConditions(collected);

    return collected;
  }

  /**
   * Collect error classification metrics
   * @param {object} errorClassifier - ErrorClassifier instance
   * @returns {object} Error metrics
   */
  collectErrorMetrics(errorClassifier) {
    if (!errorClassifier) {
      return { errors: null };
    }

    const metrics = errorClassifier.getMetrics();

    return {
      errors: {
        totalClassifications: metrics.totalClassifications,
        byType: metrics.byType,
        byPriority: metrics.byPriority,
        retryableRate: metrics.retryableRate,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Collect error recovery metrics
   * @param {object} errorRecovery - ErrorRecoveryStrategies instance
   * @returns {object} Recovery metrics
   */
  collectRecoveryMetrics(errorRecovery) {
    if (!errorRecovery) {
      return { recovery: null };
    }

    const metrics = errorRecovery.getMetrics();

    return {
      recovery: {
        totalRecoveries: metrics.totalRecoveries,
        successfulRecoveries: metrics.successfulRecoveries,
        failedRecoveries: metrics.failedRecoveries,
        recoverySuccessRate: metrics.recoverySuccessRate,
        byStrategy: metrics.byStrategy,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Collect circuit breaker metrics
   * @param {object} circuitBreaker - CircuitBreaker instance
   * @returns {object} Circuit breaker metrics
   */
  collectCircuitBreakerMetrics(circuitBreaker) {
    if (!circuitBreaker) {
      return { circuitBreaker: null };
    }

    const state = circuitBreaker.getState();
    const health = circuitBreaker.getHealthStatus();

    return {
      circuitBreaker: {
        state: state.state,
        failures: state.failures,
        successes: state.successes,
        consecutiveFailures: state.consecutiveFailures,
        errorRate: state.errorRate,
        currentThreshold: state.currentThreshold,
        backoffMultiplier: state.backoffMultiplier,
        nextAttemptTime: state.nextAttemptTime,
        metrics: state.metrics,
        health,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Check alert conditions and create alerts
   * @param {object} metrics - Current metrics
   */
  checkAlertConditions(metrics) {
    const now = Date.now();

    // High error rate alert
    if (
      metrics.circuitBreaker &&
      metrics.circuitBreaker.errorRate > this.thresholds.errorRate
    ) {
      this.createAlert({
        level: "WARNING",
        type: "ERROR_RATE_HIGH",
        message: `High error rate: ${metrics.circuitBreaker.errorRate.toFixed(1)}%`,
        metrics: { errorRate: metrics.circuitBreaker.errorRate },
        timestamp: now,
      });
    }

    // Circuit breaker open alert
    if (metrics.circuitBreaker && metrics.circuitBreaker.state === "OPEN") {
      const openDuration = metrics.circuitBreaker.nextAttemptTime
        ? metrics.circuitBreaker.nextAttemptTime - now
        : 0;

      if (openDuration > this.thresholds.circuitOpenDuration) {
        this.createAlert({
          level: "CRITICAL",
          type: "CIRCUIT_OPEN_LONG",
          message: `Circuit breaker open for extended period: ${Math.floor(openDuration / 60000)} minutes`,
          metrics: { openDuration, state: metrics.circuitBreaker.state },
          timestamp: now,
        });
      } else {
        this.createAlert({
          level: "WARNING",
          type: "CIRCUIT_OPEN",
          message: "Circuit breaker is OPEN - service degraded",
          metrics: {
            state: metrics.circuitBreaker.state,
            errorRate: metrics.circuitBreaker.errorRate,
          },
          timestamp: now,
        });
      }
    }

    // Low recovery success rate alert
    if (
      metrics.recovery &&
      metrics.recovery.totalRecoveries > 10 &&
      metrics.recovery.recoverySuccessRate < this.thresholds.recoveryRate
    ) {
      this.createAlert({
        level: "WARNING",
        type: "LOW_RECOVERY_RATE",
        message: `Low recovery success rate: ${metrics.recovery.recoverySuccessRate.toFixed(1)}%`,
        metrics: {
          successRate: metrics.recovery.recoverySuccessRate,
          total: metrics.recovery.totalRecoveries,
        },
        timestamp: now,
      });
    }

    // Critical priority errors
    if (
      metrics.errors &&
      metrics.errors.byPriority &&
      metrics.errors.byPriority.CRITICAL > 0
    ) {
      this.createAlert({
        level: "CRITICAL",
        type: "CRITICAL_ERRORS",
        message: `Critical errors detected: ${metrics.errors.byPriority.CRITICAL}`,
        metrics: { count: metrics.errors.byPriority.CRITICAL },
        timestamp: now,
      });
    }

    // High memory usage
    if (
      metrics.memory &&
      metrics.memory.heapUsed / metrics.memory.heapTotal > 0.9
    ) {
      this.createAlert({
        level: "WARNING",
        type: "MEMORY_HIGH",
        message: "High memory usage detected",
        metrics: {
          heapUsed: metrics.memory.heapUsed,
          heapTotal: metrics.memory.heapTotal,
          percentage:
            (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100,
        },
        timestamp: now,
      });
    }
  }

  /**
   * Create an alert
   * @param {object} alert - Alert details
   */
  createAlert(alert) {
    // Check if duplicate alert exists in recent alerts
    const isDuplicate = this.alerts.slice(-10).some(
      (a) => a.type === alert.type && Date.now() - a.timestamp < 60000, // Within 1 minute
    );

    if (!isDuplicate) {
      this.alerts.push(alert);

      // Keep only recent alerts
      if (this.alerts.length > this.maxAlerts) {
        this.alerts.shift();
      }

      // Log alert
      const logLevel = alert.level === "CRITICAL" ? "error" : "warn";
      console[logLevel](
        `🚨 RELIABILITY ALERT [${alert.level}] ${alert.type}: ${alert.message}`,
      );
    }
  }

  /**
   * Get recent alerts
   * @param {number} count - Number of alerts to return
   * @returns {Array} Recent alerts
   */
  getRecentAlerts(count = 10) {
    return this.alerts.slice(-count);
  }

  /**
   * Get alerts by level
   * @param {string} level - Alert level (CRITICAL, WARNING, INFO)
   * @returns {Array} Filtered alerts
   */
  getAlertsByLevel(level) {
    return this.alerts.filter((alert) => alert.level === level);
  }

  /**
   * Clear old alerts
   * @param {number} maxAge - Maximum age in milliseconds
   */
  clearOldAlerts(maxAge = 86400000) {
    // Default 24 hours
    const now = Date.now();
    this.alerts = this.alerts.filter((alert) => now - alert.timestamp < maxAge);
  }

  /**
   * Generate dashboard summary
   * @param {object} sources - Metric sources
   * @returns {object} Dashboard data
   */
  generateDashboard(sources = {}) {
    const metrics = this.collect(sources);

    return {
      status: this.getOverallStatus(metrics),
      summary: {
        totalErrors: metrics.errors?.totalClassifications || 0,
        errorRate: metrics.circuitBreaker?.errorRate || 0,
        recoveryRate: metrics.recovery?.recoverySuccessRate || 0,
        circuitState: metrics.circuitBreaker?.state || "UNKNOWN",
        activeAlerts: this.getAlertsByLevel("CRITICAL").length,
      },
      metrics,
      alerts: {
        critical: this.getAlertsByLevel("CRITICAL").slice(-5),
        warnings: this.getAlertsByLevel("WARNING").slice(-5),
        total: this.alerts.length,
      },
      health: {
        errors: metrics.errors ? "OK" : "UNAVAILABLE",
        recovery: metrics.recovery ? "OK" : "UNAVAILABLE",
        circuitBreaker: metrics.circuitBreaker?.health?.healthy
          ? "OK"
          : "DEGRADED",
        overall: this.getOverallStatus(metrics),
      },
      recommendations: this.generateRecommendations(metrics),
    };
  }

  /**
   * Get overall system status
   * @param {object} metrics - Current metrics
   * @returns {string} Status (HEALTHY, DEGRADED, CRITICAL)
   */
  getOverallStatus(metrics) {
    const criticalAlerts = this.getAlertsByLevel("CRITICAL");

    if (criticalAlerts.length > 0) {
      return "CRITICAL";
    }

    if (
      metrics.circuitBreaker?.state === "OPEN" ||
      (metrics.circuitBreaker?.errorRate &&
        metrics.circuitBreaker.errorRate > this.thresholds.errorRate)
    ) {
      return "DEGRADED";
    }

    return "HEALTHY";
  }

  /**
   * Generate recommendations based on current state
   * @param {object} metrics - Current metrics
   * @returns {Array} Recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Circuit breaker recommendations
    if (metrics.circuitBreaker?.state === "OPEN") {
      recommendations.push({
        priority: "HIGH",
        category: "Circuit Breaker",
        message:
          "Circuit breaker is open - service is degraded. Check error logs and upstream services.",
        action:
          "Investigate recent errors and ensure upstream services are healthy",
      });
    }

    // Error rate recommendations
    if (
      metrics.circuitBreaker?.errorRate &&
      metrics.circuitBreaker.errorRate > this.thresholds.errorRate
    ) {
      recommendations.push({
        priority: "MEDIUM",
        category: "Error Rate",
        message: `Error rate is ${metrics.circuitBreaker.errorRate.toFixed(1)}% (threshold: ${this.thresholds.errorRate}%)`,
        action:
          "Review error types and implement fixes for most common error patterns",
      });
    }

    // Recovery rate recommendations
    if (
      metrics.recovery?.recoverySuccessRate &&
      metrics.recovery.recoverySuccessRate < this.thresholds.recoveryRate
    ) {
      recommendations.push({
        priority: "MEDIUM",
        category: "Recovery",
        message: `Recovery success rate is ${metrics.recovery.recoverySuccessRate.toFixed(1)}% (threshold: ${this.thresholds.recoveryRate}%)`,
        action: "Improve fallback strategies or add more recovery mechanisms",
      });
    }

    // Memory recommendations
    if (
      metrics.memory &&
      metrics.memory.heapUsed / metrics.memory.heapTotal > 0.8
    ) {
      recommendations.push({
        priority: "LOW",
        category: "Memory",
        message: `Memory usage is ${((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100).toFixed(1)}%`,
        action: "Monitor for memory leaks and consider increasing heap size",
      });
    }

    // Critical errors recommendations
    if (metrics.errors?.byPriority && metrics.errors.byPriority.CRITICAL > 0) {
      recommendations.push({
        priority: "HIGH",
        category: "Critical Errors",
        message: `${metrics.errors.byPriority.CRITICAL} critical errors detected`,
        action: "Review and fix critical errors immediately",
      });
    }

    return recommendations;
  }

  /**
   * Export metrics for external monitoring (Grafana, Prometheus, etc.)
   * @param {object} sources - Metric sources
   * @returns {object} Exportable metrics
   */
  exportMetrics(sources = {}) {
    const metrics = this.collect(sources);

    return {
      // Prometheus-style metrics
      cleanspace_error_total: metrics.errors?.totalClassifications || 0,
      cleanspace_error_rate: metrics.circuitBreaker?.errorRate || 0,
      cleanspace_recovery_total: metrics.recovery?.totalRecoveries || 0,
      cleanspace_recovery_success_rate:
        metrics.recovery?.recoverySuccessRate || 0,
      cleanspace_circuit_breaker_state:
        metrics.circuitBreaker?.state === "OPEN" ? 1 : 0,
      cleanspace_circuit_breaker_error_rate:
        metrics.circuitBreaker?.errorRate || 0,
      cleanspace_circuit_breaker_opens:
        metrics.circuitBreaker?.metrics?.circuitOpens || 0,
      cleanspace_alerts_critical: this.getAlertsByLevel("CRITICAL").length,
      cleanspace_alerts_warning: this.getAlertsByLevel("WARNING").length,
      cleanspace_memory_heap_used: metrics.memory?.heapUsed || 0,
      cleanspace_memory_heap_total: metrics.memory?.heapTotal || 0,
      cleanspace_uptime_seconds: metrics.uptime || 0,
    };
  }

  /**
   * Get time series data for graphing
   * @param {string} _metric - Metric name
   * @param {string} _window - Time window (realtime, short, medium)
   * @returns {Array} Time series data
   */
  getTimeSeries(_metric, _window = "short") {
    // TODO: Implement time series storage and retrieval
    // For now, return empty array
    return [];
  }
}

// Singleton instance
export const reliabilityMetrics = new ReliabilityMetricsCollector();
