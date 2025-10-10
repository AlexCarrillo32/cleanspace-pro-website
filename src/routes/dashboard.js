/**
 * Unified Dashboard API Routes
 *
 * Aggregates metrics from all systems into a single comprehensive dashboard:
 * - Safety metrics (PII, jailbreaks, content safety)
 * - Reliability metrics (errors, recovery, circuit breaker)
 * - Cost optimization metrics (routing, budgets, batching)
 * - System health (uptime, memory, database)
 */

import express from "express";
import { safetyMetrics } from "../utils/SafetyMetricsCollector.js";
import { reliabilityMetrics } from "../utils/ReliabilityMetricsCollector.js";
import { piiDetector } from "../utils/PIIDetector.js";
import { jailbreakDetector } from "../utils/JailbreakDetector.js";
import { errorClassifier } from "../utils/ErrorClassifier.js";
import { errorRecovery } from "../utils/ErrorRecoveryStrategies.js";
import { costPerformanceOptimizer } from "../services/CostPerformanceOptimizer.js";
import { getIntelligentRouter } from "../services/IntelligentRouter.js";

const router = express.Router();

/**
 * GET /api/dashboard
 * Unified dashboard with all system metrics
 */
router.get("/", async (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    // Collect metrics from all systems
    const safetyData = safetyMetrics.collect({
      piiDetector,
      jailbreakDetector,
      errorClassifier,
      circuitBreaker,
    });

    const reliabilityData = reliabilityMetrics.generateDashboard({
      errorClassifier,
      errorRecovery,
    });

    const costMetrics = costPerformanceOptimizer.getMetrics();

    // Get routing stats - handle lazy initialization
    let routingStats = {
      routedToFast: 0,
      routedToBalanced: 0,
      totalRequests: 0,
    };
    try {
      const intelligentRouter = getIntelligentRouter();
      if (
        intelligentRouter &&
        typeof intelligentRouter.getStatistics === "function"
      ) {
        routingStats = intelligentRouter.getStatistics();
      }
    } catch (error) {
      console.warn("Could not get routing statistics:", error.message);
    }

    // System health
    const systemHealth = {
      status: "healthy",
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
      },
    };

    // Overall status determination
    const overallStatus = determineOverallStatus({
      safety: safetyData,
      reliability: reliabilityData,
      cost: costMetrics,
      system: systemHealth,
    });

    // Build unified dashboard
    const dashboard = {
      status: overallStatus.status,
      summary: overallStatus.summary,
      timestamp: new Date().toISOString(),

      // Safety metrics
      safety: {
        status: safetyMetrics.getOverallStatus(safetyData),
        piiDetections: safetyData?.pii?.totalDetections || 0,
        jailbreakAttempts: safetyData?.jailbreaks?.totalDetections || 0,
        blockedRequests:
          (safetyData?.pii?.blocked || 0) +
          (safetyData?.jailbreaks?.blocked || 0),
        recentAlerts: safetyMetrics.getRecentAlerts(5),
        details: {
          pii: {
            highRisk: safetyData?.pii?.byRisk?.HIGH || 0,
            mediumRisk: safetyData?.pii?.byRisk?.MEDIUM || 0,
            lowRisk: safetyData?.pii?.byRisk?.LOW || 0,
          },
          jailbreaks: {
            blocked: safetyData?.jailbreaks?.blocked || 0,
            detectionRate: safetyData?.jailbreaks?.detectionRate || 0,
          },
        },
      },

      // Reliability metrics
      reliability: {
        status: reliabilityData?.status || "unknown",
        errorRate: reliabilityData?.metrics?.errorRate || 0,
        recoveryRate: reliabilityData?.metrics?.recoveryRate || 0,
        circuitBreaker: {
          state: circuitBreaker ? circuitBreaker.getState().state : "UNKNOWN",
          failures: circuitBreaker ? circuitBreaker.getState().failures : 0,
        },
        recentErrors:
          reliabilityData?.recentErrors?.slice(0, 5).map((err) => ({
            type: err.classification?.type,
            message: err.message?.substring(0, 100),
            timestamp: err.timestamp,
            recovered: err.recovered,
          })) || [],
        details: {
          totalErrors: reliabilityData?.metrics?.totalErrors || 0,
          recoveryStrategies:
            reliabilityData?.metrics?.recoveryStrategies || {},
          avgRecoveryTime: reliabilityData?.metrics?.avgRecoveryTime || 0,
        },
      },

      // Cost optimization metrics
      cost: {
        status: costMetrics.totalCost < 1.0 ? "optimal" : "warning",
        totalCost: Number(costMetrics.totalCost.toFixed(4)),
        avgCostPerRequest: Number(
          costMetrics.avgCostPerRequest.toFixed(6) || 0,
        ),
        avgCostPerBooking: Number(
          costMetrics.avgCostPerBooking.toFixed(4) || 0,
        ),
        savingsPercent: Number(costMetrics.optimizationSavings.toFixed(1)),
        routing: {
          fastPercent: routingStats.routing
            ? parseFloat(routingStats.routing.fast?.percentage) || 0
            : 0,
          balancedPercent: routingStats.routing
            ? parseFloat(routingStats.routing.balanced?.percentage) || 0
            : 0,
        },
        budgets: {
          daily: {
            used: costMetrics.dailyBudgetUsed || 0,
            limit: 10.0,
            remaining: 10.0 - (costMetrics.dailyBudgetUsed || 0),
          },
          monthly: {
            used: costMetrics.monthlyBudgetUsed || 0,
            limit: 300.0,
            remaining: 300.0 - (costMetrics.monthlyBudgetUsed || 0),
          },
        },
      },

      // Performance metrics
      performance: {
        avgLatency: Number(costMetrics.avgLatency.toFixed(0)),
        totalRequests: costMetrics.totalRequests,
        bookingRate: Number(
          (
            (costMetrics.bookingsCompleted / costMetrics.totalRequests) * 100 ||
            0
          ).toFixed(1),
        ),
        cacheHitRate: 0, // TODO: Add cache metrics
      },

      // System health
      system: systemHealth,

      // Quick actions / recommendations
      recommendations: generateRecommendations({
        safety: safetyData,
        reliability: reliabilityData,
        cost: costMetrics,
      }),
    };

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error("Error generating unified dashboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate dashboard",
      message: error.message,
    });
  }
});

/**
 * GET /api/dashboard/status
 * Quick status check (lightweight)
 */
router.get("/status", (req, res) => {
  try {
    const circuitBreaker = req.app.get("circuitBreaker");

    const status = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        circuitBreaker: circuitBreaker
          ? circuitBreaker.getState().state
          : "UNKNOWN",
        safety: "active",
        reliability: "active",
        costOptimization: "active",
      },
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
    });
  }
});

/**
 * GET /api/dashboard/alerts
 * All recent alerts across all systems
 */
router.get("/alerts", (req, res) => {
  try {
    const { count = 20, level } = req.query;

    const safetyAlerts = safetyMetrics.getRecentAlerts(parseInt(count));
    const reliabilityAlerts = reliabilityMetrics.getRecentAlerts(
      parseInt(count),
    );

    let allAlerts = [...safetyAlerts, ...reliabilityAlerts];

    // Filter by level if specified
    if (level) {
      allAlerts = allAlerts.filter(
        (alert) => alert.level === level.toUpperCase(),
      );
    }

    // Sort by timestamp (most recent first)
    allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to requested count
    allAlerts = allAlerts.slice(0, parseInt(count));

    res.json({
      success: true,
      data: {
        alerts: allAlerts,
        total: allAlerts.length,
        byLevel: {
          critical: allAlerts.filter((a) => a.level === "CRITICAL").length,
          warning: allAlerts.filter((a) => a.level === "WARNING").length,
          info: allAlerts.filter((a) => a.level === "INFO").length,
        },
        bySystem: {
          safety: safetyAlerts.length,
          reliability: reliabilityAlerts.length,
        },
      },
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
 * Helper: Determine overall system status
 */
function determineOverallStatus({ safety, reliability, cost, system }) {
  const issues = [];

  // Check safety (with safe navigation)
  if (safety?.jailbreaks?.blocked > 10) {
    issues.push("High jailbreak attempt rate");
  }
  if (safety?.pii?.byRisk?.HIGH > 5) {
    issues.push("High-risk PII detections");
  }

  // Check reliability (with safe navigation)
  if (reliability?.metrics?.errorRate > 10) {
    issues.push("High error rate");
  }
  if (reliability?.metrics?.recoveryRate < 80) {
    issues.push("Low recovery success rate");
  }

  // Check cost (with safe navigation)
  if (cost?.dailyBudgetUsed > 8.0) {
    issues.push("Approaching daily budget limit");
  }

  // Check system (with safe navigation)
  if (system?.memory && system.memory.used / system.memory.total > 0.9) {
    issues.push("High memory usage");
  }

  if (issues.length === 0) {
    return {
      status: "healthy",
      summary: "All systems operational",
    };
  } else if (issues.length <= 2) {
    return {
      status: "warning",
      summary: `${issues.length} issue(s) detected`,
      issues,
    };
  } else {
    return {
      status: "critical",
      summary: `${issues.length} critical issues`,
      issues,
    };
  }
}

/**
 * Helper: Generate actionable recommendations
 */
function generateRecommendations({ safety, reliability, cost }) {
  const recommendations = [];

  // Safety recommendations (with safe navigation)
  if (safety?.jailbreaks?.blocked > 10) {
    recommendations.push({
      type: "safety",
      priority: "high",
      message: "High jailbreak attempt rate - review detection patterns",
      action: "Review /api/metrics/jailbreaks for details",
    });
  }

  if (safety?.pii?.byRisk?.HIGH > 5) {
    recommendations.push({
      type: "safety",
      priority: "high",
      message: "High-risk PII detected - review logging practices",
      action: "Check /api/metrics/pii for affected conversations",
    });
  }

  // Reliability recommendations (with safe navigation)
  if (reliability?.metrics?.errorRate > 10) {
    recommendations.push({
      type: "reliability",
      priority: "high",
      message: "Error rate above threshold - investigate root cause",
      action: "Review /api/reliability-monitoring/errors",
    });
  }

  if (reliability?.metrics?.recoveryRate < 80) {
    recommendations.push({
      type: "reliability",
      priority: "medium",
      message: "Recovery rate below target - tune strategies",
      action: "Adjust retry policies or circuit breaker thresholds",
    });
  }

  // Cost recommendations (with safe navigation)
  if (cost?.dailyBudgetUsed > 8.0) {
    recommendations.push({
      type: "cost",
      priority: "high",
      message: "Approaching daily budget limit",
      action: "Enable stricter budget controls or increase limit",
    });
  }

  if (cost?.avgCostPerRequest > 0.005) {
    recommendations.push({
      type: "cost",
      priority: "medium",
      message: "High cost per request",
      action: "Review routing strategy and enable batching",
    });
  }

  // If no issues, provide optimization suggestions
  if (recommendations.length === 0) {
    recommendations.push({
      type: "optimization",
      priority: "low",
      message: "All systems running smoothly",
      action: "Consider enabling advanced features like multi-model routing",
    });
  }

  return recommendations;
}

export default router;
