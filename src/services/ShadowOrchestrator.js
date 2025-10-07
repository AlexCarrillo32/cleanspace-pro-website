/**
 * Shadow Deployment Orchestrator
 *
 * Orchestrates shadow deployments for AI agent A/B testing:
 * - Manages shadow variant lifecycle
 * - Tracks rollout progress
 * - Analyzes comparison metrics
 * - Provides promotion/rollback decisions
 */

import { ShadowDeployment } from "../utils/ShadowDeployment.js";
import { SchedulingAgent } from "./SchedulingAgent.js";
import { getDatabase } from "../database/init.js";

export class ShadowOrchestrator {
  constructor() {
    this.shadowDeployment = new ShadowDeployment();
    this.agents = new Map(); // sessionId -> { primary, shadow }
    this.rolloutConfig = {
      shadowVariant: null,
      primaryVariant: "baseline",
      trafficPercent: 0,
      startTime: null,
      targetSamples: 100,
      autoPromote: false,
      promotionThreshold: {
        minSamples: 50,
        maxCostIncrease: 0.1, // 10%
        minPerformanceImprovement: 0.05, // 5%
        maxErrorRate: 0.05, // 5%
      },
    };
  }

  /**
   * Start shadow deployment
   */
  startShadowDeployment(shadowVariant, options = {}) {
    this.rolloutConfig = {
      shadowVariant,
      primaryVariant: options.primaryVariant || "baseline",
      trafficPercent: options.trafficPercent || 100,
      startTime: Date.now(),
      targetSamples: options.targetSamples || 100,
      autoPromote: options.autoPromote || false,
      promotionThreshold: {
        ...this.rolloutConfig.promotionThreshold,
        ...options.promotionThreshold,
      },
    };

    this.shadowDeployment.enable(shadowVariant, options.trafficPercent || 100);

    console.log(`🚀 Shadow deployment started: ${shadowVariant}`);
    console.log(`   Primary: ${this.rolloutConfig.primaryVariant}`);
    console.log(`   Traffic: ${this.rolloutConfig.trafficPercent}%`);
    console.log(`   Target samples: ${this.rolloutConfig.targetSamples}`);
    console.log(`   Auto-promote: ${this.rolloutConfig.autoPromote}`);

    return this.rolloutConfig;
  }

  /**
   * Stop shadow deployment
   */
  stopShadowDeployment() {
    this.shadowDeployment.disable();
    console.log(
      `🛑 Shadow deployment stopped: ${this.rolloutConfig.shadowVariant}`,
    );

    const metrics = this.shadowDeployment.getMetrics();
    return {
      shadowVariant: this.rolloutConfig.shadowVariant,
      primaryVariant: this.rolloutConfig.primaryVariant,
      ...metrics,
    };
  }

  /**
   * Execute chat with shadow deployment
   */
  async chatWithShadow(
    conversationId,
    sessionId,
    userMessage,
    variantOverride = null,
  ) {
    const primaryVariant = variantOverride || this.rolloutConfig.primaryVariant;
    const shadowVariant = this.rolloutConfig.shadowVariant;

    // Get or create agents
    if (!this.agents.has(sessionId)) {
      this.agents.set(sessionId, {
        primary: new SchedulingAgent(primaryVariant),
        shadow: shadowVariant ? new SchedulingAgent(shadowVariant) : null,
      });
    }

    const agents = this.agents.get(sessionId);

    // Define primary execution
    const primaryFn = () => agents.primary.chat(conversationId, userMessage);

    // If shadow is enabled, use shadow deployment
    if (shadowVariant && agents.shadow) {
      const shadowFn = () => agents.shadow.chat(conversationId, userMessage);

      return await this.shadowDeployment.executeWithShadow(
        primaryFn,
        shadowFn,
        {
          conversationId,
          sessionId,
          userMessage,
          primaryVariant,
          shadowVariant,
        },
      );
    }

    // No shadow - just execute primary
    return await primaryFn();
  }

  /**
   * Get shadow deployment status
   */
  getStatus() {
    const metrics = this.shadowDeployment.getMetrics();
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count
         FROM shadow_comparisons
         WHERE primary_variant = ?
         AND shadow_variant = ?`,
        [this.rolloutConfig.primaryVariant, this.rolloutConfig.shadowVariant],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const samplesCollected = row ? row.count : 0;
          const progress =
            this.rolloutConfig.targetSamples > 0
              ? (samplesCollected / this.rolloutConfig.targetSamples) * 100
              : 0;

          resolve({
            active: this.rolloutConfig.shadowVariant !== null,
            shadowVariant: this.rolloutConfig.shadowVariant,
            primaryVariant: this.rolloutConfig.primaryVariant,
            trafficPercent: this.rolloutConfig.trafficPercent,
            startTime: this.rolloutConfig.startTime,
            duration: this.rolloutConfig.startTime
              ? Date.now() - this.rolloutConfig.startTime
              : 0,
            samplesCollected,
            targetSamples: this.rolloutConfig.targetSamples,
            progress: `${progress.toFixed(1)}%`,
            metrics: metrics.summary,
          });
        },
      );
    });
  }

  /**
   * Analyze shadow deployment results
   */
  async analyzeShadowResults() {
    const db = getDatabase();
    const { shadowVariant, primaryVariant } = this.rolloutConfig;

    if (!shadowVariant) {
      return { error: "No active shadow deployment" };
    }

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT
          COUNT(*) as total_comparisons,
          SUM(different) as differences,
          AVG(difference_score) as avg_difference_score,
          AVG(primary_duration) as avg_primary_duration,
          AVG(shadow_duration) as avg_shadow_duration,
          AVG(shadow_duration - primary_duration) as avg_latency_delta
         FROM shadow_comparisons
         WHERE primary_variant = ?
         AND shadow_variant = ?`,
        [primaryVariant, shadowVariant],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const metrics = rows[0];
          const differenceRate =
            metrics.total_comparisons > 0
              ? metrics.differences / metrics.total_comparisons
              : 0;
          const performanceDelta =
            metrics.avg_primary_duration > 0
              ? (metrics.avg_latency_delta / metrics.avg_primary_duration) * 100
              : 0;

          const analysis = {
            shadowVariant,
            primaryVariant,
            totalComparisons: metrics.total_comparisons,
            differenceRate: `${(differenceRate * 100).toFixed(2)}%`,
            avgDifferenceScore: metrics.avg_difference_score?.toFixed(3) || 0,
            avgPrimaryDuration: Math.round(metrics.avg_primary_duration) || 0,
            avgShadowDuration: Math.round(metrics.avg_shadow_duration) || 0,
            avgLatencyDelta: Math.round(metrics.avg_latency_delta) || 0,
            performanceDelta: `${performanceDelta.toFixed(2)}%`,
          };

          resolve(analysis);
        },
      );
    });
  }

  /**
   * Check if shadow should be promoted
   */
  async checkPromotionCriteria() {
    const analysis = await this.analyzeShadowResults();
    const { promotionThreshold } = this.rolloutConfig;

    if (analysis.error) {
      return { shouldPromote: false, reason: analysis.error };
    }

    const reasons = [];
    let shouldPromote = true;

    // Check minimum samples
    if (analysis.totalComparisons < promotionThreshold.minSamples) {
      shouldPromote = false;
      reasons.push(
        `Insufficient samples (${analysis.totalComparisons}/${promotionThreshold.minSamples})`,
      );
    }

    // Check error rate (difference rate as proxy)
    const differenceRate = parseFloat(analysis.differenceRate) / 100;
    if (differenceRate > promotionThreshold.maxErrorRate) {
      shouldPromote = false;
      reasons.push(
        `High difference rate (${(differenceRate * 100).toFixed(2)}% > ${(promotionThreshold.maxErrorRate * 100).toFixed(2)}%)`,
      );
    }

    // Check performance delta
    const perfDelta = parseFloat(analysis.performanceDelta) / 100;
    if (
      perfDelta > 0 &&
      perfDelta < promotionThreshold.minPerformanceImprovement
    ) {
      reasons.push(
        `Minimal performance improvement (${(perfDelta * 100).toFixed(2)}% < ${(promotionThreshold.minPerformanceImprovement * 100).toFixed(2)}%)`,
      );
    } else if (
      perfDelta < 0 &&
      Math.abs(perfDelta) > promotionThreshold.maxCostIncrease
    ) {
      shouldPromote = false;
      reasons.push(
        `Performance degradation too high (${(perfDelta * 100).toFixed(2)}% > ${(promotionThreshold.maxCostIncrease * 100).toFixed(2)}%)`,
      );
    }

    return {
      shouldPromote,
      reasons,
      analysis,
      threshold: promotionThreshold,
    };
  }

  /**
   * Promote shadow to primary
   */
  async promoteShadowToPrimary() {
    const { shadowVariant, primaryVariant } = this.rolloutConfig;

    if (!shadowVariant) {
      throw new Error("No active shadow deployment to promote");
    }

    const promotionCheck = await this.checkPromotionCriteria();

    if (!promotionCheck.shouldPromote) {
      throw new Error(
        `Shadow variant cannot be promoted: ${promotionCheck.reasons.join(", ")}`,
      );
    }

    console.log(`✅ Promoting shadow variant: ${shadowVariant} → primary`);
    console.log(`   Previous primary: ${primaryVariant}`);

    // Update config
    this.rolloutConfig.primaryVariant = shadowVariant;
    this.rolloutConfig.shadowVariant = null;

    // Disable shadow deployment
    this.shadowDeployment.disable();

    return {
      promoted: true,
      newPrimary: shadowVariant,
      previousPrimary: primaryVariant,
      analysis: promotionCheck.analysis,
    };
  }

  /**
   * Rollback shadow deployment
   */
  rollbackShadow() {
    const { shadowVariant, primaryVariant } = this.rolloutConfig;

    console.log(`↩️ Rolling back shadow deployment: ${shadowVariant}`);
    console.log(`   Keeping primary: ${primaryVariant}`);

    this.shadowDeployment.disable();
    this.rolloutConfig.shadowVariant = null;

    return {
      rolledBack: true,
      primary: primaryVariant,
      shadowRemoved: shadowVariant,
    };
  }

  /**
   * Gradual traffic ramp-up
   */
  async rampUpTraffic(targetPercent, stepSize = 10, delayMs = 60000) {
    const { shadowVariant, trafficPercent } = this.rolloutConfig;

    if (!shadowVariant) {
      throw new Error("No active shadow deployment");
    }

    console.log(
      `📈 Ramping up shadow traffic: ${trafficPercent}% → ${targetPercent}%`,
    );

    let currentPercent = trafficPercent;

    while (currentPercent < targetPercent) {
      currentPercent = Math.min(currentPercent + stepSize, targetPercent);
      this.rolloutConfig.trafficPercent = currentPercent;
      this.shadowDeployment.shadowTrafficPercent = currentPercent;

      console.log(`   Traffic now at ${currentPercent}%`);

      if (currentPercent < targetPercent) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.log(`✅ Traffic ramp-up complete: ${targetPercent}%`);

    return {
      shadowVariant,
      trafficPercent: currentPercent,
    };
  }

  /**
   * Get shadow deployment history
   */
  async getDeploymentHistory(limit = 10) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT
          shadow_variant,
          primary_variant,
          COUNT(*) as comparisons,
          SUM(different) as differences,
          AVG(difference_score) as avg_difference,
          AVG(shadow_duration) as avg_shadow_duration,
          AVG(primary_duration) as avg_primary_duration,
          MIN(created_at) as first_comparison,
          MAX(created_at) as last_comparison
         FROM shadow_comparisons
         GROUP BY shadow_variant, primary_variant
         ORDER BY MAX(created_at) DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });
  }
}

// Singleton instance
export const shadowOrchestrator = new ShadowOrchestrator();
