/**
 * Reliability and Monitoring API Routes
 *
 * Endpoints for monitoring system health, cache performance,
 * shadow deployments, and overall reliability metrics.
 */

import express from "express";
import { responseCache } from "../utils/ResponseCache.js";
import { shadowOrchestrator } from "../services/ShadowOrchestrator.js";
import { getDatabase } from "../database/init.js";

const router = express.Router();

/**
 * GET /api/reliability/health
 * System health check
 */
router.get("/health", async (req, res) => {
  try {
    const db = getDatabase();

    // Check database connectivity
    const dbHealth = await new Promise((resolve) => {
      db.get("SELECT 1 as health", (err, row) => {
        resolve({
          status: err ? "unhealthy" : "healthy",
          error: err?.message,
        });
      });
    });

    // Get cache health
    const cacheMetrics = responseCache.getMetrics();

    // Get shadow deployment status
    const shadowStatus = await shadowOrchestrator.getStatus();

    // Overall health status
    const isHealthy = dbHealth.status === "healthy";

    res.json({
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      components: {
        database: dbHealth,
        cache: {
          status: "healthy",
          hitRate: cacheMetrics.hitRate,
          totalRequests: cacheMetrics.totalRequests,
        },
        shadowDeployment: {
          status: shadowStatus.active ? "active" : "inactive",
          variant: shadowStatus.shadowVariant,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/metrics
 * Comprehensive reliability metrics
 */
router.get("/metrics", async (req, res) => {
  try {
    const db = getDatabase();

    // Get cache metrics
    const cacheMetrics = responseCache.getMetrics();

    // Get safety metrics
    const safetyMetrics = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          safety_check_type,
          COUNT(*) as total_checks,
          SUM(blocked) as blocked_count,
          violation_type
         FROM safety_metrics
         GROUP BY safety_check_type, violation_type`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get conversation metrics
    const conversationMetrics = await new Promise((resolve, reject) => {
      db.get(
        `SELECT
          COUNT(*) as total_conversations,
          SUM(booking_completed) as bookings_completed,
          SUM(escalated_to_human) as escalations,
          AVG(total_cost_usd) as avg_cost_per_conversation,
          AVG(total_tokens) as avg_tokens_per_conversation
         FROM conversations`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        },
      );
    });

    // Get error rates by variant
    const errorRates = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          variant,
          COUNT(*) as total,
          SUM(CASE WHEN booking_completed = 1 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN escalated_to_human = 1 THEN 1 ELSE 0 END) as escalations
         FROM conversations
         GROUP BY variant`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    res.json({
      timestamp: new Date().toISOString(),
      cache: cacheMetrics,
      safety: safetyMetrics,
      conversations: conversationMetrics,
      errorRates: errorRates.map((row) => ({
        variant: row.variant,
        total: row.total,
        successRate: `${((row.successes / row.total) * 100).toFixed(2)}%`,
        escalationRate: `${((row.escalations / row.total) * 100).toFixed(2)}%`,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/cache/stats
 * Detailed cache statistics
 */
router.get("/cache/stats", async (req, res) => {
  try {
    const db = getDatabase();

    // Get cache metrics
    const cacheMetrics = responseCache.getMetrics();

    // Get top cached queries
    const topQueries = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          user_message,
          variant,
          hit_count,
          cost_usd,
          response_time_ms,
          created_at,
          last_accessed
         FROM response_cache
         ORDER BY hit_count DESC
         LIMIT 20`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get cache size by variant
    const cacheByVariant = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          variant,
          COUNT(*) as entries,
          SUM(hit_count) as total_hits,
          AVG(cost_usd) as avg_cost_saved,
          AVG(response_time_ms) as avg_time_saved
         FROM response_cache
         GROUP BY variant`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    res.json({
      timestamp: new Date().toISOString(),
      overall: cacheMetrics,
      topQueries,
      byVariant: cacheByVariant,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/cache/clear
 * Clear cache (all or by variant)
 */
router.post("/cache/clear", async (req, res) => {
  try {
    const { variant } = req.body;

    if (variant) {
      const db = getDatabase();
      const result = await new Promise((resolve, reject) => {
        db.run(
          `DELETE FROM response_cache WHERE variant = ?`,
          [variant],
          function (err) {
            if (err) reject(err);
            else resolve({ cleared: this.changes });
          },
        );
      });

      res.json({
        message: `Cache cleared for variant: ${variant}`,
        entriesCleared: result.cleared,
      });
    } else {
      const result = await responseCache.clearAll();
      res.json({
        message: "All cache cleared",
        entriesCleared: result.cleared,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/cache/clear-expired
 * Clear expired cache entries
 */
router.post("/cache/clear-expired", async (req, res) => {
  try {
    const result = await responseCache.clearExpired();

    res.json({
      message: "Expired cache entries cleared",
      entriesCleared: result.cleared,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/shadow/status
 * Shadow deployment status
 */
router.get("/shadow/status", async (req, res) => {
  try {
    const status = await shadowOrchestrator.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/shadow/start
 * Start shadow deployment
 */
router.post("/shadow/start", async (req, res) => {
  try {
    const {
      shadowVariant,
      primaryVariant = "baseline",
      trafficPercent = 100,
      targetSamples = 100,
      autoPromote = false,
    } = req.body;

    if (!shadowVariant) {
      return res.status(400).json({
        error: "shadowVariant is required",
      });
    }

    const config = shadowOrchestrator.startShadowDeployment(shadowVariant, {
      primaryVariant,
      trafficPercent,
      targetSamples,
      autoPromote,
    });

    res.json({
      message: "Shadow deployment started",
      config,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/shadow/stop
 * Stop shadow deployment
 */
router.post("/shadow/stop", async (req, res) => {
  try {
    const result = shadowOrchestrator.stopShadowDeployment();

    res.json({
      message: "Shadow deployment stopped",
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/shadow/analysis
 * Analyze shadow deployment results
 */
router.get("/shadow/analysis", async (req, res) => {
  try {
    const analysis = await shadowOrchestrator.analyzeShadowResults();

    res.json(analysis);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/shadow/promotion-check
 * Check if shadow can be promoted
 */
router.get("/shadow/promotion-check", async (req, res) => {
  try {
    const check = await shadowOrchestrator.checkPromotionCriteria();

    res.json(check);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/shadow/promote
 * Promote shadow to primary
 */
router.post("/shadow/promote", async (req, res) => {
  try {
    const result = await shadowOrchestrator.promoteShadowToPrimary();

    res.json({
      message: "Shadow variant promoted to primary",
      result,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/reliability/shadow/rollback
 * Rollback shadow deployment
 */
router.post("/shadow/rollback", async (req, res) => {
  try {
    const result = shadowOrchestrator.rollbackShadow();

    res.json({
      message: "Shadow deployment rolled back",
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/shadow/history
 * Shadow deployment history
 */
router.get("/shadow/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await shadowOrchestrator.getDeploymentHistory(limit);

    res.json({
      history,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/reliability/safety
 * Safety metrics and violations
 */
router.get("/safety", async (req, res) => {
  try {
    const db = getDatabase();

    // Get safety metrics summary
    const summary = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          safety_check_type,
          COUNT(*) as total_checks,
          SUM(blocked) as blocked_count,
          violation_type,
          COUNT(DISTINCT conversation_id) as affected_conversations
         FROM safety_metrics
         GROUP BY safety_check_type, violation_type
         ORDER BY blocked_count DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get recent violations
    const recentViolations = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          conversation_id,
          safety_check_type,
          violation_type,
          user_message,
          created_at
         FROM safety_metrics
         WHERE blocked = 1
         ORDER BY created_at DESC
         LIMIT 20`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    res.json({
      timestamp: new Date().toISOString(),
      summary,
      recentViolations,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
