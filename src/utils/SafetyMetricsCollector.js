/**
 * SafetyMetricsCollector - Real-time safety monitoring and alerting
 *
 * Aggregates metrics from all safety systems:
 * - PII Detection (PIIDetector)
 * - Jailbreak Detection (JailbreakDetector)
 * - Error Classification (ErrorClassifier)
 * - Circuit Breaker (CircuitBreaker)
 * - Content Safety (AIContentSafety)
 */

export class SafetyMetricsCollector {
  constructor() {
    this.alerts = [];
    this.maxAlerts = 100;

    // Thresholds for alerting
    this.thresholds = {
      piiDetectionRate: 10, // Alert if >10% messages contain PII
      jailbreakRate: 5, // Alert if >5% messages are jailbreak attempts
      errorRate: 15, // Alert if >15% requests fail
      circuitOpenDuration: 300000, // Alert if circuit open > 5 minutes
    };

    // Time windows for metrics
    this.windows = {
      realtime: 60000, // 1 minute
      short: 300000, // 5 minutes
      medium: 3600000, // 1 hour
      long: 86400000, // 24 hours
    };

    // Metrics storage
    this.metrics = {
      timestamp: Date.now(),
      pii: {
        total: 0,
        detected: 0,
        byType: {},
        highRisk: 0,
      },
      jailbreaks: {
        total: 0,
        detected: 0,
        byType: {},
        bySeverity: {},
      },
      errors: {
        total: 0,
        failed: 0,
        byType: {},
        retryable: 0,
      },
      circuitBreaker: {
        state: "CLOSED",
        opens: 0,
        closes: 0,
        errorRate: 0,
      },
      performance: {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
      },
    };
  }

  /**
   * Collect metrics from all systems
   * @param {object} sources - Metric sources
   * @returns {object} Aggregated metrics
   */
  collect(sources = {}) {
    const collected = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...this.collectPIIMetrics(sources.piiDetector),
      ...this.collectJailbreakMetrics(sources.jailbreakDetector),
      ...this.collectErrorMetrics(sources.errorClassifier),
      ...this.collectCircuitBreakerMetrics(sources.circuitBreaker),
      alerts: this.getRecentAlerts(10),
    };

    // Check for alert conditions
    this.checkAlertConditions(collected);

    return collected;
  }

  /**
   * Collect PII detection metrics
   * @param {object} piiDetector - PIIDetector instance
   * @returns {object} PII metrics
   */
  collectPIIMetrics(piiDetector) {
    if (!piiDetector) {
      return { pii: null };
    }

    const metrics = piiDetector.getMetrics();

    return {
      pii: {
        totalChecks: metrics.totalChecks,
        piiDetected: metrics.piiDetected,
        detectionRate: metrics.detectionRate,
        byType: metrics.byType,
        criticalDetections:
          metrics.byType.ssn || 0 + metrics.byType.creditCard || 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Collect jailbreak detection metrics
   * @param {object} jailbreakDetector - JailbreakDetector instance
   * @returns {object} Jailbreak metrics
   */
  collectJailbreakMetrics(jailbreakDetector) {
    if (!jailbreakDetector) {
      return { jailbreaks: null };
    }

    const metrics = jailbreakDetector.getMetrics();

    return {
      jailbreaks: {
        totalChecks: metrics.totalChecks,
        detected: metrics.jailbreaksDetected,
        detectionRate: metrics.detectionRate,
        byType: metrics.byType,
        bySeverity: metrics.bySeverity,
        activeSessions: metrics.activeSessions,
        timestamp: new Date().toISOString(),
      },
    };
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
   * Collect circuit breaker metrics
   * @param {object} circuitBreaker - CircuitBreaker instance
   * @returns {object} Circuit breaker metrics
   */
  collectCircuitBreakerMetrics(circuitBreaker) {
    if (!circuitBreaker) {
      return { circuitBreaker: null };
    }

    const state = circuitBreaker.getState();

    return {
      circuitBreaker: {
        state: state.state,
        failures: state.failures,
        successes: state.successes,
        errorRate: state.errorRate,
        currentThreshold: state.currentThreshold,
        backoffMultiplier: state.backoffMultiplier,
        metrics: state.metrics,
        healthy: state.healthStatus.healthy,
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

    // PII detection rate alert
    if (
      metrics.pii &&
      metrics.pii.detectionRate > this.thresholds.piiDetectionRate
    ) {
      this.createAlert({
        level: "WARNING",
        type: "PII_DETECTION_HIGH",
        message: `High PII detection rate: ${metrics.pii.detectionRate.toFixed(1)}%`,
        metrics: { detectionRate: metrics.pii.detectionRate },
        timestamp: now,
      });
    }

    // Jailbreak detection rate alert
    if (
      metrics.jailbreaks &&
      metrics.jailbreaks.detectionRate > this.thresholds.jailbreakRate
    ) {
      this.createAlert({
        level: "CRITICAL",
        type: "JAILBREAK_ATTACK",
        message: `High jailbreak detection rate: ${metrics.jailbreaks.detectionRate.toFixed(1)}%`,
        metrics: { detectionRate: metrics.jailbreaks.detectionRate },
        timestamp: now,
      });
    }

    // Critical jailbreak attempts
    if (
      metrics.jailbreaks &&
      metrics.jailbreaks.bySeverity &&
      metrics.jailbreaks.bySeverity.CRITICAL > 0
    ) {
      this.createAlert({
        level: "CRITICAL",
        type: "JAILBREAK_CRITICAL",
        message: `Critical jailbreak attempts detected: ${metrics.jailbreaks.bySeverity.CRITICAL}`,
        metrics: { count: metrics.jailbreaks.bySeverity.CRITICAL },
        timestamp: now,
      });
    }

    // Circuit breaker open alert
    if (metrics.circuitBreaker && metrics.circuitBreaker.state === "OPEN") {
      this.createAlert({
        level: "CRITICAL",
        type: "CIRCUIT_OPEN",
        message: "Circuit breaker is OPEN - service degraded",
        metrics: {
          state: metrics.circuitBreaker.state,
          errorRate: metrics.circuitBreaker.errorRate,
        },
        timestamp: now,
      });
    }

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

    // High memory usage alert
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
        `🚨 ALERT [${alert.level}] ${alert.type}: ${alert.message}`,
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
        totalChecks:
          (metrics.pii?.totalChecks || 0) +
          (metrics.jailbreaks?.totalChecks || 0),
        piiDetections: metrics.pii?.piiDetected || 0,
        jailbreakDetections: metrics.jailbreaks?.detected || 0,
        activeAlerts: this.getAlertsByLevel("CRITICAL").length,
        circuitState: metrics.circuitBreaker?.state || "UNKNOWN",
      },
      metrics,
      alerts: {
        critical: this.getAlertsByLevel("CRITICAL").slice(-5),
        warnings: this.getAlertsByLevel("WARNING").slice(-5),
        total: this.alerts.length,
      },
      health: {
        pii: metrics.pii ? "OK" : "UNAVAILABLE",
        jailbreaks: metrics.jailbreaks ? "OK" : "UNAVAILABLE",
        errors: metrics.errors ? "OK" : "UNAVAILABLE",
        circuitBreaker: metrics.circuitBreaker?.healthy ? "OK" : "DEGRADED",
      },
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
      (metrics.jailbreaks &&
        metrics.jailbreaks.detectionRate > this.thresholds.jailbreakRate)
    ) {
      return "DEGRADED";
    }

    return "HEALTHY";
  }

  /**
   * Get metrics for time window
   * @param {string} window - Window name (realtime, short, medium, long)
   * @returns {number} Window duration in ms
   */
  getWindow(window) {
    return this.windows[window] || this.windows.realtime;
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
      cleanspace_pii_detections_total: metrics.pii?.piiDetected || 0,
      cleanspace_pii_detection_rate: metrics.pii?.detectionRate || 0,
      cleanspace_jailbreak_detections_total: metrics.jailbreaks?.detected || 0,
      cleanspace_jailbreak_detection_rate:
        metrics.jailbreaks?.detectionRate || 0,
      cleanspace_errors_total: metrics.errors?.totalClassifications || 0,
      cleanspace_circuit_breaker_state:
        metrics.circuitBreaker?.state === "OPEN" ? 1 : 0,
      cleanspace_circuit_breaker_error_rate:
        metrics.circuitBreaker?.errorRate || 0,
      cleanspace_alerts_critical: this.getAlertsByLevel("CRITICAL").length,
      cleanspace_alerts_warning: this.getAlertsByLevel("WARNING").length,
      cleanspace_memory_heap_used: metrics.memory?.heapUsed || 0,
      cleanspace_memory_heap_total: metrics.memory?.heapTotal || 0,
      cleanspace_uptime_seconds: metrics.uptime || 0,
    };
  }
}

// Singleton instance
export const safetyMetrics = new SafetyMetricsCollector();
