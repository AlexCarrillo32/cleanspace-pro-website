/**
 * Cost Optimization API Routes
 *
 * Endpoints for cost/performance monitoring and optimization control.
 */

import express from "express";
import { intelligentRouter } from "../services/IntelligentRouter.js";
import { requestBatcher } from "../services/RequestBatcher.js";
import { promptBudgetManager } from "../services/PromptBudgetManager.js";
import { costPerformanceOptimizer } from "../services/CostPerformanceOptimizer.js";

const router = express.Router();

/**
 * GET /api/optimization/report
 * Get comprehensive optimization report
 */
router.get("/report", async (req, res) => {
  try {
    const report = costPerformanceOptimizer.getOptimizationReport();

    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/metrics
 * Get optimization metrics
 */
router.get("/metrics", async (req, res) => {
  try {
    const metrics = costPerformanceOptimizer.getMetrics();

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/routing/stats
 * Get intelligent routing statistics
 */
router.get("/routing/stats", async (req, res) => {
  try {
    const stats = intelligentRouter.getStatistics();

    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/routing/recommendations
 * Get routing recommendations
 */
router.get("/routing/recommendations", async (req, res) => {
  try {
    const recommendations = intelligentRouter.getRecommendations();

    res.json({
      recommendations,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/batching/stats
 * Get batching statistics
 */
router.get("/batching/stats", async (req, res) => {
  try {
    const stats = requestBatcher.getMetrics();

    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/optimization/batching/flush
 * Flush pending batch immediately
 */
router.post("/batching/flush", async (req, res) => {
  try {
    await requestBatcher.flush();

    res.json({
      message: "Batch flushed successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/budgets/status
 * Get budget status
 */
router.get("/budgets/status", async (req, res) => {
  try {
    const status = promptBudgetManager.getBudgetStatus();

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/budgets/metrics
 * Get budget metrics
 */
router.get("/budgets/metrics", async (req, res) => {
  try {
    const metrics = promptBudgetManager.getMetrics();

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/optimization/budgets/config
 * Update budget configuration
 */
router.post("/budgets/config", async (req, res) => {
  try {
    const {
      maxInputTokens,
      maxOutputTokens,
      maxCostPerRequest,
      maxDailyCost,
      maxMonthlyCost,
    } = req.body;

    if (maxInputTokens !== undefined) {
      promptBudgetManager.config.maxInputTokens = parseInt(maxInputTokens);
    }
    if (maxOutputTokens !== undefined) {
      promptBudgetManager.config.maxOutputTokens = parseInt(maxOutputTokens);
    }
    if (maxCostPerRequest !== undefined) {
      promptBudgetManager.config.maxCostPerRequest =
        parseFloat(maxCostPerRequest);
    }
    if (maxDailyCost !== undefined) {
      promptBudgetManager.config.maxDailyCost = parseFloat(maxDailyCost);
    }
    if (maxMonthlyCost !== undefined) {
      promptBudgetManager.config.maxMonthlyCost = parseFloat(maxMonthlyCost);
    }

    res.json({
      message: "Budget configuration updated",
      config: {
        maxInputTokens: promptBudgetManager.config.maxInputTokens,
        maxOutputTokens: promptBudgetManager.config.maxOutputTokens,
        maxCostPerRequest: promptBudgetManager.config.maxCostPerRequest,
        maxDailyCost: promptBudgetManager.config.maxDailyCost,
        maxMonthlyCost: promptBudgetManager.config.maxMonthlyCost,
      },
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/recommendations
 * Get all optimization recommendations
 */
router.get("/recommendations", async (req, res) => {
  try {
    const recommendations = costPerformanceOptimizer.getAllRecommendations();

    res.json({
      recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/optimization/strategy
 * Update optimization strategy
 */
router.post("/strategy", async (req, res) => {
  try {
    const { strategy } = req.body;

    if (
      !["cost_optimized", "performance_optimized", "balanced"].includes(
        strategy,
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid strategy. Must be one of: cost_optimized, performance_optimized, balanced",
      });
    }

    costPerformanceOptimizer.config.strategy = strategy;
    intelligentRouter.config.defaultStrategy = strategy;

    res.json({
      message: `Optimization strategy updated to: ${strategy}`,
      strategy,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/savings
 * Get cost savings summary
 */
router.get("/savings", async (req, res) => {
  try {
    const report = costPerformanceOptimizer.getOptimizationReport();

    res.json({
      totalSavings: report.summary.optimizationSavings,
      savingsPercent: report.summary.savingsPercent,
      totalCost: report.summary.totalCost,
      breakdown: {
        routing: {
          fastModelUsage: report.components.routing.routing.fast.percentage,
          balancedModelUsage:
            report.components.routing.routing.balanced.percentage,
        },
        batching: {
          tokensSaved: report.components.batching.tokensSaved,
          costSaved: report.components.batching.costSaved,
        },
        budgets: {
          trimmedRequests: report.components.budgets.trimmedRequests,
          blockedRequests: report.components.budgets.blockedRequests,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/optimization/reset
 * Reset optimization metrics
 */
router.post("/reset", async (req, res) => {
  try {
    costPerformanceOptimizer.resetMetrics();
    requestBatcher.resetMetrics();

    res.json({
      message: "Optimization metrics reset successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/optimization/health
 * Health check for optimization systems
 */
router.get("/health", async (req, res) => {
  try {
    const routingMetrics = intelligentRouter.getMetrics();
    const batchingMetrics = requestBatcher.getMetrics();
    const budgetMetrics = promptBudgetManager.getMetrics();

    const health = {
      status: "healthy",
      components: {
        routing: {
          status: "healthy",
          totalRequests: routingMetrics.totalRequests,
        },
        batching: {
          status: "healthy",
          totalBatches: batchingMetrics.totalBatches,
        },
        budgets: {
          status:
            parseFloat(budgetMetrics.budgetStatus.daily.usage) > 90
              ? "warning"
              : "healthy",
          dailyUsage: budgetMetrics.budgetStatus.daily.usage,
        },
      },
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

export default router;
