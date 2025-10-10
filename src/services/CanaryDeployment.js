/**
 * Canary Deployment System
 *
 * Manages gradual rollout with automatic promotion/rollback:
 * - Gradual traffic increase (10% → 25% → 50% → 100%)
 * - Statistical validation at each stage
 * - Automatic rollback on failure detection
 * - Real-time health monitoring
 *
 * Built on top of ShadowOrchestrator for production safety.
 */

import { ShadowOrchestrator } from "./ShadowOrchestrator.js";
import { getDatabase } from "../database/init.js";

export class CanaryDeployment {
  constructor() {
    this.shadowOrchestrator = new ShadowOrchestrator();

    // Deployment state
    this.state = {
      active: false,
      stage: null, // 'canary_10', 'canary_25', 'canary_50', 'canary_100', 'promoted', 'rolled_back'
      canaryVariant: null,
      stableVariant: "baseline",
      startTime: null,
      currentTrafficPercent: 0,
      autoPromote: false,
      autoRollback: true,
    };

    // Rollout stages
    this.stages = [
      { name: "canary_10", traffic: 10, minSamples: 20, duration: 300000 }, // 5 min
      { name: "canary_25", traffic: 25, minSamples: 50, duration: 600000 }, // 10 min
      { name: "canary_50", traffic: 50, minSamples: 100, duration: 900000 }, // 15 min
      { name: "canary_100", traffic: 100, minSamples: 200, duration: 1800000 }, // 30 min
    ];

    // Health thresholds for auto-rollback
    this.healthThresholds = {
      maxErrorRate: 0.05, // 5% error rate triggers rollback
      maxLatencyIncrease: 0.5, // 50% latency increase triggers rollback
      maxCostIncrease: 0.3, // 30% cost increase triggers rollback
      minSuccessRate: 0.9, // 90% success rate required
      minSampleSize: 10, // Minimum samples before evaluating health
    };

    // Statistical validation config
    this.statsConfig = {
      confidenceLevel: 0.95, // 95% confidence
      minEffectSize: 0.05, // 5% minimum improvement to be significant
      minSamples: 30, // Minimum for statistical validity
    };

    // Stage check interval
    this.stageCheckInterval = null;
  }

  /**
   * Start canary deployment with gradual rollout
   */
  async startCanary(canaryVariant, options = {}) {
    if (this.state.active) {
      throw new Error(
        "Canary deployment already active. Stop current deployment first.",
      );
    }

    this.state = {
      active: true,
      stage: "canary_10",
      canaryVariant,
      stableVariant: options.stableVariant || "baseline",
      startTime: Date.now(),
      currentTrafficPercent: 10,
      autoPromote:
        options.autoPromote !== undefined ? options.autoPromote : true,
      autoRollback:
        options.autoRollback !== undefined ? options.autoRollback : true,
      stageHistory: [],
    };

    // Start at 10% traffic
    await this.shadowOrchestrator.startShadowDeployment(canaryVariant, {
      primaryVariant: this.state.stableVariant,
      trafficPercent: 10,
      autoPromote: false, // We handle promotion
    });

    // Start stage monitoring
    this.startStageMonitoring();

    // Log deployment started
    await this.logDeploymentEvent("canary_started", {
      canaryVariant,
      stableVariant: this.state.stableVariant,
      initialTraffic: 10,
    });

    console.log(`🐤 Canary deployment started: ${canaryVariant}`);
    console.log(`   Stable: ${this.state.stableVariant}`);
    console.log(`   Initial traffic: 10%`);
    console.log(`   Auto-promote: ${this.state.autoPromote}`);
    console.log(`   Auto-rollback: ${this.state.autoRollback}`);

    return this.getStatus();
  }

  /**
   * Stop canary deployment
   */
  async stopCanary(reason = "manual_stop") {
    if (!this.state.active) {
      throw new Error("No active canary deployment");
    }

    // Stop monitoring
    if (this.stageCheckInterval) {
      clearInterval(this.stageCheckInterval);
      this.stageCheckInterval = null;
    }

    // Stop shadow deployment
    const shadowMetrics = this.shadowOrchestrator.stopShadowDeployment();

    // Log deployment stopped
    await this.logDeploymentEvent("canary_stopped", {
      reason,
      finalStage: this.state.stage,
      duration: Date.now() - this.state.startTime,
      ...shadowMetrics,
    });

    const finalStatus = this.getStatus();

    this.state = {
      active: false,
      stage: null,
      canaryVariant: null,
      stableVariant: "baseline",
      startTime: null,
      currentTrafficPercent: 0,
      autoPromote: false,
      autoRollback: true,
    };

    console.log(`🛑 Canary deployment stopped: ${reason}`);

    return finalStatus;
  }

  /**
   * Promote canary to stable (100% traffic)
   */
  async promoteCanary() {
    if (!this.state.active) {
      throw new Error("No active canary deployment");
    }

    // Perform final validation
    const validation = await this.validateStage(this.state.stage);

    if (!validation.passed) {
      throw new Error(
        `Cannot promote - validation failed: ${validation.failures.join(", ")}`,
      );
    }

    // Log promotion
    await this.logDeploymentEvent("canary_promoted", {
      canaryVariant: this.state.canaryVariant,
      previousStable: this.state.stableVariant,
      finalMetrics: validation.metrics,
    });

    this.state.stage = "promoted";
    this.state.currentTrafficPercent = 100;

    console.log(`✅ Canary promoted: ${this.state.canaryVariant}`);
    console.log(`   New stable variant: ${this.state.canaryVariant}`);

    // Stop canary deployment
    await this.stopCanary("promoted");

    return {
      status: "promoted",
      newStable: this.state.canaryVariant,
      previousStable: this.state.stableVariant,
    };
  }

  /**
   * Rollback canary deployment
   */
  async rollbackCanary(reason = "manual_rollback") {
    if (!this.state.active) {
      throw new Error("No active canary deployment");
    }

    // Log rollback
    await this.logDeploymentEvent("canary_rolled_back", {
      canaryVariant: this.state.canaryVariant,
      reason,
      stage: this.state.stage,
      trafficPercent: this.state.currentTrafficPercent,
    });

    this.state.stage = "rolled_back";

    console.log(`⏪ Canary rolled back: ${reason}`);
    console.log(`   Canary: ${this.state.canaryVariant}`);
    console.log(`   Stable: ${this.state.stableVariant}`);

    // Stop canary deployment
    await this.stopCanary(`rolled_back: ${reason}`);

    return {
      status: "rolled_back",
      reason,
      stable: this.state.stableVariant,
    };
  }

  /**
   * Start automatic stage monitoring
   */
  startStageMonitoring() {
    // Check every 30 seconds
    this.stageCheckInterval = setInterval(async () => {
      try {
        await this.checkStageProgress();
      } catch (error) {
        console.error("Stage monitoring error:", error);
      }
    }, 30000);
  }

  /**
   * Check if current stage is ready to advance
   */
  async checkStageProgress() {
    if (!this.state.active || this.state.stage === "promoted") {
      return;
    }

    const currentStage = this.stages.find((s) => s.name === this.state.stage);
    if (!currentStage) {
      return;
    }

    // Check health first (auto-rollback if unhealthy)
    if (this.state.autoRollback) {
      const health = await this.checkCanaryHealth();
      if (!health.healthy) {
        console.warn(
          `⚠️ Canary unhealthy - triggering rollback: ${health.reason}`,
        );
        await this.rollbackCanary(`auto_rollback: ${health.reason}`);
        return;
      }
    }

    // Check if stage is complete
    const validation = await this.validateStage(this.state.stage);

    if (validation.passed) {
      // Stage passed - advance or promote
      const currentIndex = this.stages.findIndex(
        (s) => s.name === this.state.stage,
      );
      const nextStage = this.stages[currentIndex + 1];

      if (nextStage) {
        // Advance to next stage
        await this.advanceStage(nextStage);
      } else if (this.state.autoPromote) {
        // Final stage passed - auto-promote
        console.log("✅ Final stage passed - auto-promoting canary to stable");
        await this.promoteCanary();
      } else {
        console.log("✅ Final stage passed - waiting for manual promotion");
      }
    }
  }

  /**
   * Advance to next rollout stage
   */
  async advanceStage(nextStage) {
    const previousStage = this.state.stage;

    this.state.stage = nextStage.name;
    this.state.currentTrafficPercent = nextStage.traffic;
    this.state.stageHistory.push({
      stage: previousStage,
      timestamp: Date.now(),
      result: "passed",
    });

    // Update shadow deployment traffic
    this.shadowOrchestrator.shadowDeployment.shadowTrafficPercent =
      nextStage.traffic;

    // Log stage advance
    await this.logDeploymentEvent("stage_advanced", {
      previousStage,
      newStage: nextStage.name,
      newTraffic: nextStage.traffic,
    });

    console.log(`📈 Canary advanced to ${nextStage.name}`);
    console.log(
      `   Traffic: ${previousStage} (${this.state.currentTrafficPercent}%) → ${nextStage.name} (${nextStage.traffic}%)`,
    );
  }

  /**
   * Validate current stage metrics
   */
  async validateStage(stageName) {
    const stage = this.stages.find((s) => s.name === stageName);
    if (!stage) {
      return { passed: false, failures: ["Invalid stage"] };
    }

    const metrics = await this.getStageMetrics();
    const failures = [];

    // Check minimum samples
    if (metrics.samples < stage.minSamples) {
      failures.push(
        `Insufficient samples: ${metrics.samples}/${stage.minSamples}`,
      );
    }

    // Check minimum duration
    const stageDuration = Date.now() - this.state.startTime;
    if (stageDuration < stage.duration) {
      const remainingMinutes = Math.ceil(
        (stage.duration - stageDuration) / 60000,
      );
      failures.push(`Stage duration not met: ${remainingMinutes}min remaining`);
    }

    // Check error rate
    if (metrics.errorRate > this.healthThresholds.maxErrorRate) {
      failures.push(
        `Error rate too high: ${(metrics.errorRate * 100).toFixed(1)}%`,
      );
    }

    // Check success rate
    if (metrics.successRate < this.healthThresholds.minSuccessRate) {
      failures.push(
        `Success rate too low: ${(metrics.successRate * 100).toFixed(1)}%`,
      );
    }

    return {
      passed: failures.length === 0,
      failures,
      metrics,
      stage: stageName,
    };
  }

  /**
   * Check canary health for auto-rollback
   */
  async checkCanaryHealth() {
    const metrics = await this.getStageMetrics();

    // Need minimum samples before checking health
    if (metrics.samples < this.healthThresholds.minSampleSize) {
      return { healthy: true, reason: "insufficient_samples_for_health_check" };
    }

    // Check error rate
    if (metrics.errorRate > this.healthThresholds.maxErrorRate) {
      return {
        healthy: false,
        reason: `error_rate_too_high: ${(metrics.errorRate * 100).toFixed(1)}%`,
      };
    }

    // Check latency increase
    if (
      metrics.latencyIncreasePercent > this.healthThresholds.maxLatencyIncrease
    ) {
      return {
        healthy: false,
        reason: `latency_increase_too_high: ${(metrics.latencyIncreasePercent * 100).toFixed(1)}%`,
      };
    }

    // Check cost increase
    if (metrics.costIncreasePercent > this.healthThresholds.maxCostIncrease) {
      return {
        healthy: false,
        reason: `cost_increase_too_high: ${(metrics.costIncreasePercent * 100).toFixed(1)}%`,
      };
    }

    // Check success rate
    if (metrics.successRate < this.healthThresholds.minSuccessRate) {
      return {
        healthy: false,
        reason: `success_rate_too_low: ${(metrics.successRate * 100).toFixed(1)}%`,
      };
    }

    return { healthy: true, reason: null };
  }

  /**
   * Get metrics for current stage
   */
  async getStageMetrics() {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT
          COUNT(*) as total_samples,
          AVG(CASE WHEN primary_error IS NULL THEN 0 ELSE 1 END) as primary_error_rate,
          AVG(CASE WHEN shadow_error IS NULL THEN 0 ELSE 1 END) as shadow_error_rate,
          AVG(primary_latency_ms) as avg_primary_latency,
          AVG(shadow_latency_ms) as avg_shadow_latency,
          AVG(primary_cost_usd) as avg_primary_cost,
          AVG(shadow_cost_usd) as avg_shadow_cost,
          AVG(CASE WHEN action_match = 1 THEN 1 ELSE 0 END) as action_match_rate
         FROM shadow_comparisons
         WHERE primary_variant = ?
         AND shadow_variant = ?
         AND created_at > datetime('now', '-30 minutes')`,
        [this.state.stableVariant, this.state.canaryVariant],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const row = rows[0] || {};

          const samples = row.total_samples || 0;
          const errorRate = row.shadow_error_rate || 0;
          const successRate = 1 - errorRate;

          const latencyIncreasePercent =
            row.avg_primary_latency > 0
              ? (row.avg_shadow_latency - row.avg_primary_latency) /
                row.avg_primary_latency
              : 0;

          const costIncreasePercent =
            row.avg_primary_cost > 0
              ? (row.avg_shadow_cost - row.avg_primary_cost) /
                row.avg_primary_cost
              : 0;

          resolve({
            samples,
            errorRate,
            successRate,
            avgLatency: row.avg_shadow_latency || 0,
            latencyIncreasePercent,
            avgCost: row.avg_shadow_cost || 0,
            costIncreasePercent,
            actionMatchRate: row.action_match_rate || 0,
          });
        },
      );
    });
  }

  /**
   * Get deployment status
   */
  getStatus() {
    const currentStage = this.stages.find((s) => s.name === this.state.stage);

    return {
      active: this.state.active,
      stage: this.state.stage,
      canaryVariant: this.state.canaryVariant,
      stableVariant: this.state.stableVariant,
      trafficPercent: this.state.currentTrafficPercent,
      duration: this.state.startTime ? Date.now() - this.state.startTime : null,
      autoPromote: this.state.autoPromote,
      autoRollback: this.state.autoRollback,
      stageConfig: currentStage,
      stageHistory: this.state.stageHistory || [],
    };
  }

  /**
   * Log deployment event to database
   */
  async logDeploymentEvent(eventType, data) {
    const db = getDatabase();

    return new Promise((resolve) => {
      db.run(
        `INSERT INTO canary_events (event_type, canary_variant, stable_variant, data, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          eventType,
          this.state.canaryVariant,
          this.state.stableVariant,
          JSON.stringify(data),
        ],
        function (err) {
          if (err) {
            // Table might not exist - log to console instead
            console.log(`📝 Canary event: ${eventType}`, data);
            resolve({ logged: false });
          } else {
            resolve({ logged: true, id: this.lastID });
          }
        },
      );
    });
  }
}

// Singleton instance
export const canaryDeployment = new CanaryDeployment();
