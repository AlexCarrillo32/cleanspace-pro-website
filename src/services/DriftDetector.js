/**
 * AI Agent Drift Detection System
 *
 * Monitors AI agent performance over time to detect:
 * - Performance degradation (lower booking rates)
 * - Response quality drift (increased escalations)
 * - Cost drift (token/cost increases)
 * - Behavioral drift (action distribution changes)
 *
 * Triggers retraining when drift exceeds thresholds.
 */

import { getDatabase } from "../database/init.js";

export class DriftDetector {
  constructor(options = {}) {
    this.config = {
      // Performance thresholds
      bookingRateThreshold: 0.1, // 10% drop triggers alert
      escalationRateThreshold: 0.15, // 15% increase triggers alert
      costIncreaseThreshold: 0.2, // 20% cost increase triggers alert
      responseTimeThreshold: 0.25, // 25% slowdown triggers alert

      // Statistical thresholds
      minSamplesForComparison: 50, // Need 50 samples to compare
      confidenceLevel: 0.95, // 95% confidence for statistical tests

      // Time windows
      baselineWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      recentWindow: 24 * 60 * 60 * 1000, // 24 hours
      checkInterval: 60 * 60 * 1000, // Check every hour

      ...options,
    };

    this.metrics = {
      checksPerformed: 0,
      driftsDetected: 0,
      retrainingTriggered: 0,
      lastCheckTime: null,
    };
  }

  /**
   * Detect drift across all metrics
   */
  async detectDrift(variant = "baseline") {
    this.metrics.checksPerformed++;
    this.metrics.lastCheckTime = Date.now();

    const baseline = await this.getBaselineMetrics(variant);
    const recent = await this.getRecentMetrics(variant);

    if (
      !baseline ||
      !recent ||
      baseline.totalConversations < this.config.minSamplesForComparison ||
      recent.totalConversations < this.config.minSamplesForComparison
    ) {
      return {
        drift: false,
        reason: "Insufficient samples for drift detection",
        baseline,
        recent,
      };
    }

    const driftAnalysis = {
      variant,
      timestamp: new Date().toISOString(),
      baseline: baseline.window,
      recent: recent.window,
      metrics: {},
      drifts: [],
      overallDrift: false,
    };

    // 1. Booking rate drift
    const bookingDrift = this.detectBookingRateDrift(baseline, recent);
    driftAnalysis.metrics.bookingRate = bookingDrift;
    if (bookingDrift.drift) driftAnalysis.drifts.push("booking_rate");

    // 2. Escalation rate drift
    const escalationDrift = this.detectEscalationRateDrift(baseline, recent);
    driftAnalysis.metrics.escalationRate = escalationDrift;
    if (escalationDrift.drift) driftAnalysis.drifts.push("escalation_rate");

    // 3. Cost drift
    const costDrift = this.detectCostDrift(baseline, recent);
    driftAnalysis.metrics.cost = costDrift;
    if (costDrift.drift) driftAnalysis.drifts.push("cost");

    // 4. Response time drift
    const responseTimeDrift = this.detectResponseTimeDrift(baseline, recent);
    driftAnalysis.metrics.responseTime = responseTimeDrift;
    if (responseTimeDrift.drift) driftAnalysis.drifts.push("response_time");

    // 5. Action distribution drift
    const actionDrift = await this.detectActionDrift(variant);
    driftAnalysis.metrics.actionDistribution = actionDrift;
    if (actionDrift.drift) driftAnalysis.drifts.push("action_distribution");

    // Overall drift decision
    driftAnalysis.overallDrift = driftAnalysis.drifts.length > 0;

    if (driftAnalysis.overallDrift) {
      this.metrics.driftsDetected++;
      await this.logDrift(driftAnalysis);
    }

    return driftAnalysis;
  }

  /**
   * Get baseline metrics (7-day window)
   */
  async getBaselineMetrics(variant) {
    const db = getDatabase();
    const endTime = Date.now() - this.config.recentWindow;
    const startTime = endTime - this.config.baselineWindow;

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT
          COUNT(*) as totalConversations,
          SUM(booking_completed) as bookings,
          SUM(escalated_to_human) as escalations,
          AVG(total_cost_usd) as avgCost,
          AVG(total_tokens) as avgTokens
         FROM conversations
         WHERE variant = ?
         AND datetime(started_at) BETWEEN datetime(?, 'unixepoch') AND datetime(?, 'unixepoch')`,
        [variant, startTime / 1000, endTime / 1000],
        (err, row) => {
          if (err) reject(err);
          else
            resolve({
              ...row,
              window: {
                start: new Date(startTime).toISOString(),
                end: new Date(endTime).toISOString(),
              },
              bookingRate: row.bookings / row.totalConversations,
              escalationRate: row.escalations / row.totalConversations,
            });
        },
      );
    });
  }

  /**
   * Get recent metrics (24-hour window)
   */
  async getRecentMetrics(variant) {
    const db = getDatabase();
    const endTime = Date.now();
    const startTime = endTime - this.config.recentWindow;

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT
          COUNT(*) as totalConversations,
          SUM(booking_completed) as bookings,
          SUM(escalated_to_human) as escalations,
          AVG(total_cost_usd) as avgCost,
          AVG(total_tokens) as avgTokens
         FROM conversations
         WHERE variant = ?
         AND datetime(started_at) BETWEEN datetime(?, 'unixepoch') AND datetime(?, 'unixepoch')`,
        [variant, startTime / 1000, endTime / 1000],
        (err, row) => {
          if (err) reject(err);
          else
            resolve({
              ...row,
              window: {
                start: new Date(startTime).toISOString(),
                end: new Date(endTime).toISOString(),
              },
              bookingRate: row.bookings / row.totalConversations,
              escalationRate: row.escalations / row.totalConversations,
            });
        },
      );
    });
  }

  /**
   * Detect booking rate drift
   */
  detectBookingRateDrift(baseline, recent) {
    const baselineRate = baseline.bookingRate || 0;
    const recentRate = recent.bookingRate || 0;
    const change = (recentRate - baselineRate) / baselineRate;

    return {
      baselineRate: `${(baselineRate * 100).toFixed(2)}%`,
      recentRate: `${(recentRate * 100).toFixed(2)}%`,
      change: `${(change * 100).toFixed(2)}%`,
      drift: change < -this.config.bookingRateThreshold,
      severity: this.calculateSeverity(
        change,
        -this.config.bookingRateThreshold,
      ),
    };
  }

  /**
   * Detect escalation rate drift
   */
  detectEscalationRateDrift(baseline, recent) {
    const baselineRate = baseline.escalationRate || 0;
    const recentRate = recent.escalationRate || 0;
    const change = (recentRate - baselineRate) / (baselineRate || 0.01);

    return {
      baselineRate: `${(baselineRate * 100).toFixed(2)}%`,
      recentRate: `${(recentRate * 100).toFixed(2)}%`,
      change: `${(change * 100).toFixed(2)}%`,
      drift: change > this.config.escalationRateThreshold,
      severity: this.calculateSeverity(
        change,
        this.config.escalationRateThreshold,
      ),
    };
  }

  /**
   * Detect cost drift
   */
  detectCostDrift(baseline, recent) {
    const baselineCost = baseline.avgCost || 0;
    const recentCost = recent.avgCost || 0;
    const change = (recentCost - baselineCost) / (baselineCost || 0.01);

    return {
      baselineCost: `$${baselineCost.toFixed(6)}`,
      recentCost: `$${recentCost.toFixed(6)}`,
      change: `${(change * 100).toFixed(2)}%`,
      drift: change > this.config.costIncreaseThreshold,
      severity: this.calculateSeverity(
        change,
        this.config.costIncreaseThreshold,
      ),
    };
  }

  /**
   * Detect response time drift
   */
  detectResponseTimeDrift(baseline, recent) {
    // This would require adding response_time tracking to conversations table
    // For now, return no drift
    return {
      baselineTime: "N/A",
      recentTime: "N/A",
      change: "0.00%",
      drift: false,
      severity: "none",
    };
  }

  /**
   * Detect action distribution drift (Chi-squared test)
   */
  async detectActionDrift(variant) {
    const db = getDatabase();

    // Get baseline action distribution
    const baselineActions = await new Promise((resolve, reject) => {
      const endTime = Date.now() - this.config.recentWindow;
      const startTime = endTime - this.config.baselineWindow;

      db.all(
        `SELECT
          JSON_EXTRACT(content, '$.action') as action,
          COUNT(*) as count
         FROM messages
         WHERE conversation_id IN (
           SELECT id FROM conversations
           WHERE variant = ?
           AND datetime(started_at) BETWEEN datetime(?, 'unixepoch') AND datetime(?, 'unixepoch')
         )
         AND role = 'assistant'
         AND JSON_EXTRACT(content, '$.action') IS NOT NULL
         GROUP BY action`,
        [variant, startTime / 1000, endTime / 1000],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get recent action distribution
    const recentActions = await new Promise((resolve, reject) => {
      const endTime = Date.now();
      const startTime = endTime - this.config.recentWindow;

      db.all(
        `SELECT
          JSON_EXTRACT(content, '$.action') as action,
          COUNT(*) as count
         FROM messages
         WHERE conversation_id IN (
           SELECT id FROM conversations
           WHERE variant = ?
           AND datetime(started_at) BETWEEN datetime(?, 'unixepoch') AND datetime(?, 'unixepoch')
         )
         AND role = 'assistant'
         AND JSON_EXTRACT(content, '$.action') IS NOT NULL
         GROUP BY action`,
        [variant, startTime / 1000, endTime / 1000],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Calculate chi-squared statistic
    const chiSquared = this.calculateChiSquared(baselineActions, recentActions);

    return {
      baselineDistribution: this.normalizeDistribution(baselineActions),
      recentDistribution: this.normalizeDistribution(recentActions),
      chiSquared: chiSquared.toFixed(3),
      drift: chiSquared > 9.488, // 95% confidence, 4 degrees of freedom
      severity:
        chiSquared > 13.277 ? "high" : chiSquared > 9.488 ? "medium" : "low",
    };
  }

  /**
   * Calculate chi-squared statistic for action distribution
   */
  calculateChiSquared(baseline, recent) {
    const baselineMap = new Map(baseline.map((r) => [r.action, r.count]));
    const recentMap = new Map(recent.map((r) => [r.action, r.count]));

    const allActions = new Set([...baselineMap.keys(), ...recentMap.keys()]);
    const baselineTotal = baseline.reduce((sum, r) => sum + r.count, 0);
    const recentTotal = recent.reduce((sum, r) => sum + r.count, 0);

    let chiSquared = 0;

    for (const action of allActions) {
      const baselineCount = baselineMap.get(action) || 0;
      const recentCount = recentMap.get(action) || 0;

      const baselineExpected = (baselineCount / baselineTotal) * recentTotal;
      const diff = recentCount - baselineExpected;

      if (baselineExpected > 0) {
        chiSquared += (diff * diff) / baselineExpected;
      }
    }

    return chiSquared;
  }

  /**
   * Normalize distribution to percentages
   */
  normalizeDistribution(actions) {
    const total = actions.reduce((sum, r) => sum + r.count, 0);
    return actions.map((r) => ({
      action: r.action,
      percentage: `${((r.count / total) * 100).toFixed(2)}%`,
    }));
  }

  /**
   * Calculate severity level
   */
  calculateSeverity(change, threshold) {
    const ratio = Math.abs(change) / Math.abs(threshold);

    if (ratio >= 2) return "high";
    if (ratio >= 1) return "medium";
    return "low";
  }

  /**
   * Log drift to database
   */
  async logDrift(driftAnalysis) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO drift_detections (
          variant, drift_types, severity, baseline_window,
          recent_window, metrics, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const maxSeverity = this.getMaxSeverity(driftAnalysis.metrics);

      stmt.run(
        [
          driftAnalysis.variant,
          driftAnalysis.drifts.join(","),
          maxSeverity,
          JSON.stringify(driftAnalysis.baseline),
          JSON.stringify(driftAnalysis.recent),
          JSON.stringify(driftAnalysis.metrics),
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ driftId: this.lastID });
        },
      );

      stmt.finalize();
    }).catch((err) => {
      // Table might not exist yet - that's okay
      if (!err.message.includes("no such table")) {
        console.error("Error logging drift:", err);
      }
    });
  }

  /**
   * Get maximum severity from metrics
   */
  getMaxSeverity(metrics) {
    const severities = Object.values(metrics)
      .map((m) => m.severity)
      .filter(Boolean);

    if (severities.includes("high")) return "high";
    if (severities.includes("medium")) return "medium";
    return "low";
  }

  /**
   * Check if retraining should be triggered
   */
  shouldTriggerRetraining(driftAnalysis) {
    if (!driftAnalysis.overallDrift) return false;

    // Trigger retraining if:
    // 1. High severity drift detected
    const hasHighSeverity = Object.values(driftAnalysis.metrics).some(
      (m) => m.severity === "high",
    );

    // 2. Multiple medium severity drifts
    const mediumCount = Object.values(driftAnalysis.metrics).filter(
      (m) => m.severity === "medium",
    ).length;

    return hasHighSeverity || mediumCount >= 2;
  }

  /**
   * Get drift history
   */
  async getDriftHistory(variant, limit = 10) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM drift_detections
         WHERE variant = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [variant, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    }).catch(() => []);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      config: this.config,
    };
  }
}

// Singleton instance
export const driftDetector = new DriftDetector();
