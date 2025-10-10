/**
 * Canary Deployment API Routes
 *
 * Provides endpoints for:
 * - Starting/stopping canary deployments
 * - Monitoring canary health and progress
 * - Manual promotion/rollback
 * - Deployment history and analytics
 */

import express from "express";
import { canaryDeployment } from "../services/CanaryDeployment.js";

const router = express.Router();

/**
 * POST /api/canary/start
 * Start a new canary deployment
 */
router.post("/start", async (req, res) => {
  try {
    const { canaryVariant, stableVariant, autoPromote, autoRollback } =
      req.body;

    if (!canaryVariant) {
      return res.status(400).json({
        success: false,
        error: "canaryVariant is required",
      });
    }

    const status = await canaryDeployment.startCanary(canaryVariant, {
      stableVariant: stableVariant || "baseline",
      autoPromote: autoPromote !== undefined ? autoPromote : true,
      autoRollback: autoRollback !== undefined ? autoRollback : true,
    });

    res.json({
      success: true,
      message: `Canary deployment started: ${canaryVariant}`,
      data: status,
    });
  } catch (error) {
    console.error("Error starting canary deployment:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/canary/stop
 * Stop current canary deployment
 */
router.post("/stop", async (req, res) => {
  try {
    const { reason } = req.body;

    const status = await canaryDeployment.stopCanary(reason || "manual_stop");

    res.json({
      success: true,
      message: "Canary deployment stopped",
      data: status,
    });
  } catch (error) {
    console.error("Error stopping canary deployment:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/canary/promote
 * Promote canary to stable (100% traffic)
 */
router.post("/promote", async (req, res) => {
  try {
    const result = await canaryDeployment.promoteCanary();

    res.json({
      success: true,
      message: "Canary promoted to stable",
      data: result,
    });
  } catch (error) {
    console.error("Error promoting canary:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/canary/rollback
 * Rollback canary deployment
 */
router.post("/rollback", async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await canaryDeployment.rollbackCanary(
      reason || "manual_rollback",
    );

    res.json({
      success: true,
      message: "Canary rolled back",
      data: result,
    });
  } catch (error) {
    console.error("Error rolling back canary:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/canary/status
 * Get current canary deployment status
 */
router.get("/status", (req, res) => {
  try {
    const status = canaryDeployment.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("Error getting canary status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/canary/health
 * Check canary health for auto-rollback
 */
router.get("/health", async (req, res) => {
  try {
    const health = await canaryDeployment.checkCanaryHealth();
    const metrics = await canaryDeployment.getStageMetrics();

    res.json({
      success: true,
      data: {
        ...health,
        metrics,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error checking canary health:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/canary/metrics
 * Get detailed canary metrics for current stage
 */
router.get("/metrics", async (req, res) => {
  try {
    const metrics = await canaryDeployment.getStageMetrics();
    const status = canaryDeployment.getStatus();

    res.json({
      success: true,
      data: {
        stage: status.stage,
        trafficPercent: status.trafficPercent,
        metrics,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting canary metrics:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/canary/validation
 * Validate current stage for promotion
 */
router.get("/validation", async (req, res) => {
  try {
    const status = canaryDeployment.getStatus();

    if (!status.active) {
      return res.status(400).json({
        success: false,
        error: "No active canary deployment",
      });
    }

    const validation = await canaryDeployment.validateStage(status.stage);

    res.json({
      success: true,
      data: {
        ...validation,
        canPromote: validation.passed,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error validating canary stage:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/canary/stages
 * Get rollout stage configuration
 */
router.get("/stages", (req, res) => {
  try {
    const stages = canaryDeployment.stages.map((stage) => ({
      name: stage.name,
      traffic: stage.traffic,
      minSamples: stage.minSamples,
      durationMinutes: stage.duration / 60000,
    }));

    res.json({
      success: true,
      data: {
        stages,
        currentStage: canaryDeployment.state.stage,
        healthThresholds: canaryDeployment.healthThresholds,
      },
    });
  } catch (error) {
    console.error("Error getting stages:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
