/**
 * Reliability Monitoring Routes
 *
 * Provides endpoints for:
 * - Real-time reliability metrics dashboard
 * - Error classification reports
 * - Recovery strategy metrics
 * - Circuit breaker status
 * - Alert history
 */

import express from "express";
import { errorClassifier } from "../utils/ErrorClassifier.js";
import { errorRecovery } from "../utils/ErrorRecoveryStrategies.js";
import { reliabilityMetrics } from "../utils/ReliabilityMetricsCollector.js";

const router = express.Router();

/**
 * GET /api/reliability-monitoring/dashboard
 * Real-time reliability monitoring dashboard
 */
router.get("/dashboard", (req, res) => {
  const dashboard = reliabilityMetrics.generateDashboard({
    errorClassifier,
    errorRecovery,
  });

  res.json({
    success: true,
    data: dashboard,
  });
});

/**
 * GET /api/reliability-monitoring/metrics
 * Detailed metrics from all reliability systems
 */
router.get("/metrics", (req, res) => {
  const metrics = {
    errors: errorClassifier.getMetrics(),
    recovery: errorRecovery.getMetrics(),
  };

  res.json({
    success: true,
    data: metrics,
  });
});

/**
 * GET /api/reliability-monitoring/alerts
 * Get recent reliability alerts
 */
router.get("/alerts", (req, res) => {
  const { level, count = 20 } = req.query;

  let alerts;
  if (level) {
    alerts = reliabilityMetrics.getAlertsByLevel(level.toUpperCase());
  } else {
    alerts = reliabilityMetrics.getRecentAlerts(parseInt(count));
  }

  res.json({
    success: true,
    data: {
      alerts,
      total: alerts.length,
    },
  });
});

/**
 * GET /api/reliability-monitoring/errors
 * Get error classification breakdown
 */
router.get("/errors", (req, res) => {
  const metrics = errorClassifier.getMetrics();

  res.json({
    success: true,
    data: {
      totalClassifications: metrics.totalClassifications,
      byType: metrics.byType,
      byPriority: metrics.byPriority,
      retryableRate: metrics.retryableRate,
      topErrors: Object.entries(metrics.byType)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([type, count]) => ({ type, count })),
    },
  });
});

/**
 * GET /api/reliability-monitoring/recovery
 * Get recovery strategy metrics
 */
router.get("/recovery", (req, res) => {
  const metrics = errorRecovery.getMetrics();

  res.json({
    success: true,
    data: {
      totalRecoveries: metrics.totalRecoveries,
      successfulRecoveries: metrics.successfulRecoveries,
      failedRecoveries: metrics.failedRecoveries,
      recoverySuccessRate: metrics.recoverySuccessRate,
      byStrategy: metrics.byStrategy,
      topStrategies: Object.entries(metrics.byStrategy)
        .sort(([, a], [, b]) => b - a)
        .map(([strategy, count]) => ({ strategy, count })),
    },
  });
});

/**
 * GET /api/reliability-monitoring/export/prometheus
 * Export metrics in Prometheus format
 */
router.get("/export/prometheus", (req, res) => {
  const metrics = reliabilityMetrics.exportMetrics({
    errorClassifier,
    errorRecovery,
  });

  // Format as Prometheus text format
  const lines = [];
  for (const [key, value] of Object.entries(metrics)) {
    lines.push(`# TYPE ${key} gauge`);
    lines.push(`${key} ${value}`);
  }

  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(lines.join("\n"));
});

/**
 * GET /api/reliability-monitoring/health
 * Overall health check
 */
router.get("/health", (req, res) => {
  const metrics = reliabilityMetrics.collect({
    errorClassifier,
    errorRecovery,
  });

  const status = reliabilityMetrics.getOverallStatus(metrics);
  const statusCode =
    status === "HEALTHY" ? 200 : status === "DEGRADED" ? 200 : 503;

  res.status(statusCode).json({
    success: status !== "CRITICAL",
    data: {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        errorClassifier: metrics.errors ? "PASS" : "FAIL",
        errorRecovery: metrics.recovery ? "PASS" : "FAIL",
      },
      metrics: {
        errorRate: metrics.circuitBreaker?.errorRate || 0,
        recoveryRate: metrics.recovery?.recoverySuccessRate || 0,
        activeAlerts: reliabilityMetrics.getAlertsByLevel("CRITICAL").length,
      },
    },
  });
});

/**
 * GET /api/reliability-monitoring/recommendations
 * Get system recommendations
 */
router.get("/recommendations", (req, res) => {
  const metrics = reliabilityMetrics.collect({
    errorClassifier,
    errorRecovery,
  });

  const recommendations = reliabilityMetrics.generateRecommendations(metrics);

  res.json({
    success: true,
    data: {
      recommendations,
      total: recommendations.length,
      byPriority: {
        HIGH: recommendations.filter((r) => r.priority === "HIGH").length,
        MEDIUM: recommendations.filter((r) => r.priority === "MEDIUM").length,
        LOW: recommendations.filter((r) => r.priority === "LOW").length,
      },
    },
  });
});

/**
 * POST /api/reliability-monitoring/test/error
 * Test error classification (for debugging)
 */
router.post("/test/error", (req, res) => {
  const { errorMessage, errorCode, httpStatus } = req.body;

  if (!errorMessage) {
    return res.status(400).json({
      success: false,
      error: "errorMessage is required",
    });
  }

  const error = new Error(errorMessage);
  if (errorCode) error.code = errorCode;

  const classification = errorClassifier.classify(error, { httpStatus });

  res.json({
    success: true,
    data: classification,
  });
});

/**
 * DELETE /api/reliability-monitoring/alerts
 * Clear old alerts (admin endpoint)
 */
router.delete("/alerts", (req, res) => {
  const { maxAge = 86400000 } = req.body; // Default 24 hours

  reliabilityMetrics.clearOldAlerts(maxAge);

  res.json({
    success: true,
    message: `Alerts older than ${maxAge}ms cleared`,
  });
});

/**
 * POST /api/reliability-monitoring/reset
 * Reset all reliability metrics (admin endpoint, for testing)
 */
router.post("/reset", (req, res) => {
  errorClassifier.resetMetrics();
  errorRecovery.resetMetrics();
  errorRecovery.clearCache();

  res.json({
    success: true,
    message: "All reliability metrics reset",
  });
});

/**
 * GET /api/reliability-monitoring/status
 * Simplified status check
 */
router.get("/status", (req, res) => {
  const metrics = reliabilityMetrics.collect({
    errorClassifier,
    errorRecovery,
  });

  res.json({
    success: true,
    data: {
      status: reliabilityMetrics.getOverallStatus(metrics),
      errorRate: metrics.circuitBreaker?.errorRate || 0,
      recoveryRate: metrics.recovery?.recoverySuccessRate || 0,
      activeAlerts: reliabilityMetrics.getAlertsByLevel("CRITICAL").length,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
