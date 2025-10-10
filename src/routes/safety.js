/**
 * Safety Monitoring Routes
 *
 * Provides endpoints for:
 * - Real-time safety metrics dashboard
 * - PII detection reports
 * - Jailbreak detection reports
 * - Safety alert history
 */

import express from "express";
import { piiDetector } from "../utils/PIIDetector.js";
import { piiRedactor } from "../utils/PIIRedactor.js";
import { jailbreakDetector } from "../utils/JailbreakDetector.js";
import { contentSafety } from "../utils/AIContentSafety.js";
import { safetyMetrics } from "../utils/SafetyMetricsCollector.js";

const router = express.Router();

/**
 * GET /api/safety/dashboard
 * Real-time safety monitoring dashboard
 */
router.get("/dashboard", (req, res) => {
  const dashboard = safetyMetrics.generateDashboard({
    piiDetector,
    jailbreakDetector,
  });

  res.json({
    success: true,
    data: dashboard,
  });
});

/**
 * GET /api/safety/metrics
 * Detailed metrics from all safety systems
 */
router.get("/metrics", (req, res) => {
  const metrics = {
    pii: piiDetector.getMetrics(),
    jailbreak: jailbreakDetector.getMetrics(),
    contentSafety: contentSafety.getMetrics(),
    redactor: piiRedactor.getMetrics(),
  };

  res.json({
    success: true,
    data: metrics,
  });
});

/**
 * GET /api/safety/alerts
 * Get recent security alerts
 */
router.get("/alerts", (req, res) => {
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
      total: alerts.length,
    },
  });
});

/**
 * POST /api/safety/check/pii
 * Check text for PII (for testing/debugging)
 */
router.post("/check/pii", (req, res) => {
  const { text, strategy = "full" } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "Text is required",
    });
  }

  const detection = piiDetector.detectPII(text);
  const redaction = piiRedactor.redact(text, { strategy });

  res.json({
    success: true,
    data: {
      detection,
      redaction: {
        original: text,
        redacted: redaction.redacted,
        redactedCount: redaction.redactedCount,
        riskLevel: redaction.riskLevel,
      },
    },
  });
});

/**
 * POST /api/safety/check/jailbreak
 * Check text for jailbreak attempts (for testing/debugging)
 */
router.post("/check/jailbreak", (req, res) => {
  const { text, sessionId } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "Text is required",
    });
  }

  const detection = jailbreakDetector.detect(text, sessionId);

  res.json({
    success: true,
    data: detection,
  });
});

/**
 * POST /api/safety/check/content
 * Check text for unsafe content (for testing/debugging)
 */
router.post("/check/content", (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: "Text is required",
    });
  }

  const result = contentSafety.checkSafety(text);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/safety/export/prometheus
 * Export metrics in Prometheus format
 */
router.get("/export/prometheus", (req, res) => {
  const metrics = safetyMetrics.exportMetrics({
    piiDetector,
    jailbreakDetector,
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
 * DELETE /api/safety/alerts
 * Clear old alerts (admin endpoint)
 */
router.delete("/alerts", (req, res) => {
  const { maxAge = 86400000 } = req.body; // Default 24 hours

  safetyMetrics.clearOldAlerts(maxAge);

  res.json({
    success: true,
    message: `Alerts older than ${maxAge}ms cleared`,
  });
});

/**
 * POST /api/safety/reset
 * Reset all safety metrics (admin endpoint, for testing)
 */
router.post("/reset", (req, res) => {
  piiDetector.resetMetrics();
  piiRedactor.resetMetrics();
  jailbreakDetector.resetMetrics();
  contentSafety.resetMetrics();

  res.json({
    success: true,
    message: "All safety metrics reset",
  });
});

export default router;
