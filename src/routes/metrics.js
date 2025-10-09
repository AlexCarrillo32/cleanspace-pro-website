/**
 * Metrics Dashboard API Routes
 *
 * Provides endpoints for:
 * - Real-time metrics collection
 * - Dashboard data
 * - Alert management
 * - Prometheus-style metric export
 */

import express from "express";
import { safetyMetrics } from "../utils/SafetyMetricsCollector.js";
import { piiDetector } from "../utils/PIIDetector.js";
import { jailbreakDetector } from "../utils/JailbreakDetector.js";
import { errorClassifier } from "../utils/ErrorClassifier.js";

const router = express.Router();

/**
 * GET /api/metrics/dashboard
 * Get full dashboard with all metrics
 */
router.get("/dashboard", (req, res) => {
  try {
    // Get circuit breaker from app (injected by server)
    const circuitBreaker = req.app.get("circuitBreaker");

    const dashboard = safetyMetrics.generateDashboard({
      piiDetector,
      jailbreakDetector,
      errorClassifier,
      circuitBreaker,
    });

    res.json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating dashboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate dashboard",
    });
  }
});

/**
 * GET /api/metrics/summary
 * Get quick summary metrics
 */
router.get("/summary", (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    const metrics = safetyMetrics.collect({
      piiDetector,
      jailbreakDetector,
      errorClassifier,
      circuitBreaker,
    });

    res.json({
      success: true,
      data: {
        status: safetyMetrics.getOverallStatus(metrics),
        pii: metrics.pii,
        jailbreaks: metrics.jailbreaks,
        errors: metrics.errors,
        circuitBreaker: metrics.circuitBreaker,
        alertCount: safetyMetrics.alerts.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error collecting metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to collect metrics",
    });
  }
});

/**
 * GET /api/metrics/alerts
 * Get recent alerts
 */
router.get("/alerts", (req, res) => {
  try {
    const { level, count = 20 } = req.query;

    let alerts;
    if (level) {
      alerts = safetyMetrics.getAlertsByLevel(level.toUpperCase());
    } else {
      alerts = safetyMetrics.getRecentAlerts(parseInt(count));
    }

    res.json({
      success: true,
      data: {
        alerts,
        total: safetyMetrics.alerts.length,
        byLevel: {
          critical: safetyMetrics.getAlertsByLevel("CRITICAL").length,
          warning: safetyMetrics.getAlertsByLevel("WARNING").length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch alerts",
    });
  }
});

/**
 * POST /api/metrics/alerts/clear
 * Clear old alerts
 */
router.post("/alerts/clear", (req, res) => {
  try {
    const { maxAge = 86400000 } = req.body; // Default 24 hours

    safetyMetrics.clearOldAlerts(maxAge);

    res.json({
      success: true,
      message: "Old alerts cleared",
      remaining: safetyMetrics.alerts.length,
    });
  } catch (error) {
    console.error("Error clearing alerts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear alerts",
    });
  }
});

/**
 * GET /api/metrics/pii
 * Get PII detection metrics
 */
router.get("/pii", (req, res) => {
  try {
    const metrics = piiDetector.getMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching PII metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch PII metrics",
    });
  }
});

/**
 * GET /api/metrics/jailbreaks
 * Get jailbreak detection metrics
 */
router.get("/jailbreaks", (req, res) => {
  try {
    const metrics = jailbreakDetector.getMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching jailbreak metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch jailbreak metrics",
    });
  }
});

/**
 * GET /api/metrics/errors
 * Get error classification metrics
 */
router.get("/errors", (req, res) => {
  try {
    const metrics = errorClassifier.getMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching error metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch error metrics",
    });
  }
});

/**
 * GET /api/metrics/circuit-breaker
 * Get circuit breaker state
 */
router.get("/circuit-breaker", (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    if (!circuitBreaker) {
      return res.status(404).json({
        success: false,
        error: "Circuit breaker not available",
      });
    }

    const state = circuitBreaker.getState();

    res.json({
      success: true,
      data: state,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching circuit breaker state:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch circuit breaker state",
    });
  }
});

/**
 * GET /api/metrics/export
 * Export metrics in Prometheus format
 */
router.get("/export", (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    const metrics = safetyMetrics.exportMetrics({
      piiDetector,
      jailbreakDetector,
      errorClassifier,
      circuitBreaker,
    });

    // Return as Prometheus text format
    const lines = [];
    for (const [key, value] of Object.entries(metrics)) {
      lines.push(`# TYPE ${key} gauge`);
      lines.push(`${key} ${value}`);
    }

    res.set("Content-Type", "text/plain");
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Error exporting metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export metrics",
    });
  }
});

/**
 * GET /api/metrics/health
 * Simple health check endpoint
 */
router.get("/health", (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    const status = {
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      circuitBreaker: circuitBreaker
        ? circuitBreaker.getState().state
        : "UNKNOWN",
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      error: error.message,
    });
  }
});

export default router;
