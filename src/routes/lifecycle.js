/**
 * AI Agent Lifecycle Management API Routes
 *
 * Endpoints for drift detection, retraining orchestration,
 * and model version management.
 */

import express from "express";
import { driftDetector } from "../services/DriftDetector.js";
import { retrainingOrchestrator } from "../services/RetrainingOrchestrator.js";
import { modelVersionManager } from "../services/ModelVersionManager.js";

const router = express.Router();

/**
 * GET /api/lifecycle/drift/detect
 * Detect drift for a variant
 */
router.get("/drift/detect", async (req, res) => {
  try {
    const { variant = "baseline" } = req.query;

    const driftAnalysis = await driftDetector.detectDrift(variant);

    res.json(driftAnalysis);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/drift/history
 * Get drift detection history
 */
router.get("/drift/history", async (req, res) => {
  try {
    const { variant = "baseline", limit = 10 } = req.query;

    const history = await driftDetector.getDriftHistory(
      variant,
      parseInt(limit),
    );

    res.json({
      variant,
      history,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/drift/metrics
 * Get drift detector metrics
 */
router.get("/drift/metrics", async (req, res) => {
  try {
    const metrics = driftDetector.getMetrics();

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * DELETE /api/lifecycle/drift/cache
 * Clear drift detection cache
 */
router.delete("/drift/cache", async (req, res) => {
  try {
    const { variant } = req.query;

    driftDetector.clearCache(variant);

    res.json({
      success: true,
      message: variant
        ? `Cache cleared for variant: ${variant}`
        : "All drift cache cleared",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/retraining/check
 * Check if retraining should be triggered
 */
router.get("/retraining/check", async (req, res) => {
  try {
    const { variant = "baseline" } = req.query;

    const check = await retrainingOrchestrator.checkRetrainingTriggers(variant);

    res.json(check);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/lifecycle/retraining/start
 * Start retraining process
 */
router.post("/retraining/start", async (req, res) => {
  try {
    const { variant = "baseline", options = {} } = req.body;

    const result = await retrainingOrchestrator.startRetraining(
      variant,
      options,
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/lifecycle/retraining/finalize
 * Finalize retraining after shadow test
 */
router.post("/retraining/finalize", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: "sessionId is required",
      });
    }

    const result = await retrainingOrchestrator.finalizeRetraining(sessionId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/retraining/status
 * Get retraining status
 */
router.get("/retraining/status", async (req, res) => {
  try {
    const status = retrainingOrchestrator.getStatus();

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/retraining/history
 * Get retraining history
 */
router.get("/retraining/history", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const history = retrainingOrchestrator.getRetrainingHistory(
      parseInt(limit),
    );

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
 * POST /api/lifecycle/versions/register
 * Register a new prompt version
 */
router.post("/versions/register", async (req, res) => {
  try {
    const { variantName, systemPrompt, metadata = {} } = req.body;

    if (!variantName || !systemPrompt) {
      return res.status(400).json({
        error: "variantName and systemPrompt are required",
      });
    }

    const version = await modelVersionManager.registerVersion(
      variantName,
      systemPrompt,
      metadata,
    );

    res.json(version);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/lifecycle/versions/activate
 * Activate a specific version
 */
router.post("/versions/activate", async (req, res) => {
  try {
    const { variantName, version } = req.body;

    if (!variantName || version === undefined) {
      return res.status(400).json({
        error: "variantName and version are required",
      });
    }

    const result = await modelVersionManager.activateVersion(
      variantName,
      parseInt(version),
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/lifecycle/versions/rollback
 * Rollback to previous version
 */
router.post("/versions/rollback", async (req, res) => {
  try {
    const { variantName } = req.body;

    if (!variantName) {
      return res.status(400).json({
        error: "variantName is required",
      });
    }

    const result = await modelVersionManager.rollback(variantName);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/versions/active
 * Get active version for a variant
 */
router.get("/versions/active", async (req, res) => {
  try {
    const { variantName } = req.query;

    if (!variantName) {
      return res.status(400).json({
        error: "variantName is required",
      });
    }

    const version = await modelVersionManager.getActiveVersion(variantName);

    res.json(version || { message: "No active version found" });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/versions/history
 * Get version history for a variant
 */
router.get("/versions/history", async (req, res) => {
  try {
    const { variantName, limit = 20 } = req.query;

    if (!variantName) {
      return res.status(400).json({
        error: "variantName is required",
      });
    }

    const history = await modelVersionManager.getVersionHistory(
      variantName,
      parseInt(limit),
    );

    res.json({
      variantName,
      history,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/versions/compare
 * Compare two versions
 */
router.get("/versions/compare", async (req, res) => {
  try {
    const { variantName, version1, version2 } = req.query;

    if (!variantName || !version1 || !version2) {
      return res.status(400).json({
        error: "variantName, version1, and version2 are required",
      });
    }

    const comparison = await modelVersionManager.compareVersions(
      variantName,
      parseInt(version1),
      parseInt(version2),
    );

    res.json(comparison);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/versions/diff
 * Get prompt diff between versions
 */
router.get("/versions/diff", async (req, res) => {
  try {
    const { variantName, version1, version2 } = req.query;

    if (!variantName || !version1 || !version2) {
      return res.status(400).json({
        error: "variantName, version1, and version2 are required",
      });
    }

    const diff = await modelVersionManager.getVersionDiff(
      variantName,
      parseInt(version1),
      parseInt(version2),
    );

    res.json(diff);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/lifecycle/versions/tag
 * Tag a version
 */
router.post("/versions/tag", async (req, res) => {
  try {
    const { variantName, version, tag, description = "" } = req.body;

    if (!variantName || version === undefined || !tag) {
      return res.status(400).json({
        error: "variantName, version, and tag are required",
      });
    }

    const result = await modelVersionManager.tagVersion(
      variantName,
      parseInt(version),
      tag,
      description,
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/versions/list
 * List all variants
 */
router.get("/versions/list", async (req, res) => {
  try {
    const variants = await modelVersionManager.listVariants();

    res.json({
      variants,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/lifecycle/status
 * Overall lifecycle status
 */
router.get("/status", async (req, res) => {
  try {
    const driftMetrics = driftDetector.getMetrics();
    const retrainingStatus = retrainingOrchestrator.getStatus();
    const versionMetrics = modelVersionManager.getMetrics();

    res.json({
      timestamp: new Date().toISOString(),
      drift: driftMetrics,
      retraining: retrainingStatus,
      versions: versionMetrics,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
