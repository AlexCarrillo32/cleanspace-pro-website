/**
 * Retraining Orchestrator
 *
 * Manages AI agent retraining lifecycle:
 * - Triggered by drift detection or manual request
 * - Collects training data from production logs
 * - Creates new prompt variants
 * - Tests via shadow deployment
 * - Promotes if performance improves
 */

import { driftDetector } from "./DriftDetector.js";
import { shadowOrchestrator } from "./ShadowOrchestrator.js";
import { EvaluationService } from "./EvaluationService.js";
import { getDatabase } from "../database/init.js";

export class RetrainingOrchestrator {
  constructor() {
    this.config = {
      // Retraining triggers
      autoRetrain: true,
      minDriftSeverity: "medium",
      minFailedBookingsForRetrain: 10,
      retrainingCooldown: 7 * 24 * 60 * 60 * 1000, // 7 days

      // Training data collection
      minTrainingExamples: 50,
      maxTrainingExamples: 500,
      includeFailures: true,
      includeSuccesses: true,

      // Testing requirements
      shadowTestSamples: 100,
      minSuccessRateImprovement: 0.05, // 5%
      maxCostIncrease: 0.1, // 10%
    };

    this.state = {
      lastRetrainingTime: null,
      retrainingInProgress: false,
      currentVersion: 1,
      retrainingHistory: [],
    };
  }

  /**
   * Check if retraining should be triggered
   */
  async checkRetrainingTriggers(variant = "baseline") {
    // Check cooldown
    if (
      this.state.lastRetrainingTime &&
      Date.now() - this.state.lastRetrainingTime <
        this.config.retrainingCooldown
    ) {
      return {
        shouldRetrain: false,
        reason: "Retraining cooldown active",
        cooldownEndsIn:
          this.config.retrainingCooldown -
          (Date.now() - this.state.lastRetrainingTime),
      };
    }

    // Detect drift
    const driftAnalysis = await driftDetector.detectDrift(variant);

    if (!driftAnalysis.overallDrift) {
      return {
        shouldRetrain: false,
        reason: "No drift detected",
        driftAnalysis,
      };
    }

    // Check if drift warrants retraining
    const shouldRetrain = driftDetector.shouldTriggerRetraining(driftAnalysis);

    if (!shouldRetrain) {
      return {
        shouldRetrain: false,
        reason: "Drift severity below threshold",
        driftAnalysis,
      };
    }

    return {
      shouldRetrain: true,
      reason: "Drift detected",
      driftAnalysis,
      triggers: driftAnalysis.drifts,
    };
  }

  /**
   * Start retraining process
   */
  async startRetraining(variant = "baseline", options = {}) {
    if (this.state.retrainingInProgress) {
      throw new Error("Retraining already in progress");
    }

    this.state.retrainingInProgress = true;
    this.state.currentVersion++;

    const retrainingSession = {
      id: `retrain_${variant}_${Date.now()}`,
      variant,
      version: this.state.currentVersion,
      startTime: Date.now(),
      status: "collecting_data",
      ...options,
    };

    console.log(
      `🔄 Starting retraining for ${variant} (version ${this.state.currentVersion})`,
    );

    try {
      // Step 1: Collect training data
      console.log("📊 Collecting training data...");
      const trainingData = await this.collectTrainingData(variant);
      retrainingSession.trainingDataSize = trainingData.length;

      // Step 2: Analyze failures
      console.log("🔍 Analyzing failure patterns...");
      const failureAnalysis = await this.analyzeFailures(variant);
      retrainingSession.failureAnalysis = failureAnalysis;

      // Step 3: Generate improved prompt
      console.log("✏️ Generating improved prompt...");
      const improvedPrompt = await this.generateImprovedPrompt(
        variant,
        failureAnalysis,
        trainingData,
      );
      retrainingSession.improvedPrompt = improvedPrompt;

      // Step 4: Create new variant
      const newVariantName = `${variant}_v${this.state.currentVersion}`;
      console.log(`📝 Created new variant: ${newVariantName}`);
      retrainingSession.newVariant = newVariantName;

      // Step 5: Run offline evaluation
      console.log("🧪 Running offline evaluation...");
      const evalService = new EvaluationService();
      const offlineEval = await evalService.runOfflineEvaluation(
        newVariantName,
        `retrain_${retrainingSession.id}`,
      );
      retrainingSession.offlineEvaluation = offlineEval;

      // Step 6: Shadow deployment test
      console.log("🌒 Starting shadow deployment test...");
      retrainingSession.status = "shadow_testing";

      shadowOrchestrator.startShadowDeployment(newVariantName, {
        primaryVariant: variant,
        trafficPercent: 100,
        targetSamples: this.config.shadowTestSamples,
        autoPromote: false,
      });

      retrainingSession.shadowDeploymentStarted = Date.now();

      // Step 7: Wait for shadow test completion (async)
      console.log(
        `⏳ Shadow test in progress (need ${this.config.shadowTestSamples} samples)...`,
      );

      // Log retraining session
      await this.logRetrainingSession(retrainingSession);

      this.state.retrainingHistory.push(retrainingSession);

      return {
        message: "Retraining started - shadow test in progress",
        session: retrainingSession,
        nextSteps: [
          `Wait for ${this.config.shadowTestSamples} samples`,
          "Monitor shadow deployment metrics",
          "Call /api/lifecycle/retraining/finalize to complete",
        ],
      };
    } catch (error) {
      this.state.retrainingInProgress = false;
      throw error;
    }
  }

  /**
   * Finalize retraining after shadow test
   */
  async finalizeRetraining(sessionId) {
    const session = this.state.retrainingHistory.find(
      (s) => s.id === sessionId,
    );

    if (!session) {
      throw new Error(`Retraining session not found: ${sessionId}`);
    }

    // Analyze shadow deployment results
    const shadowAnalysis = await shadowOrchestrator.analyzeShadowResults();
    const promotionCheck = await shadowOrchestrator.checkPromotionCriteria();

    session.shadowAnalysis = shadowAnalysis;
    session.promotionCheck = promotionCheck;

    if (promotionCheck.shouldPromote) {
      // Promote new variant
      console.log(`✅ Promoting ${session.newVariant} to primary`);
      await shadowOrchestrator.promoteShadowToPrimary();

      session.status = "promoted";
      session.endTime = Date.now();
      session.success = true;

      this.state.lastRetrainingTime = Date.now();
      this.state.retrainingInProgress = false;

      return {
        success: true,
        message: `Retraining successful - ${session.newVariant} promoted`,
        session,
      };
    } else {
      // Rollback
      console.log(`❌ Rolling back ${session.newVariant}`);
      await shadowOrchestrator.rollbackShadow();

      session.status = "rolled_back";
      session.endTime = Date.now();
      session.success = false;

      this.state.retrainingInProgress = false;

      return {
        success: false,
        message: `Retraining unsuccessful - rolled back`,
        reasons: promotionCheck.reasons,
        session,
      };
    }
  }

  /**
   * Collect training data from production logs
   */
  async collectTrainingData(variant) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT
          c.id as conversation_id,
          c.booking_completed,
          c.escalated_to_human,
          c.customer_satisfaction,
          m.role,
          m.content
         FROM conversations c
         JOIN messages m ON m.conversation_id = c.id
         WHERE c.variant = ?
         ORDER BY c.started_at DESC
         LIMIT ?`,
        [variant, this.config.maxTrainingExamples],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });
  }

  /**
   * Analyze failure patterns
   */
  async analyzeFailures(variant) {
    const db = getDatabase();

    const failures = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          c.id as conversation_id,
          c.escalated_to_human,
          c.total_messages,
          m.content
         FROM conversations c
         JOIN messages m ON m.conversation_id = c.id
         WHERE c.variant = ?
         AND (c.booking_completed = 0 OR c.escalated_to_human = 1)
         ORDER BY c.started_at DESC
         LIMIT 50`,
        [variant],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Analyze common failure patterns
    const failurePatterns = {
      totalFailures: failures.length,
      escalations: failures.filter((f) => f.escalated_to_human).length,
      avgMessagesBeforeFailure:
        failures.reduce((sum, f) => sum + f.total_messages, 0) /
        failures.length,
      commonIssues: [],
    };

    // Extract common themes (simple keyword analysis)
    const keywords = {
      pricing: 0,
      availability: 0,
      unclear: 0,
      technical: 0,
    };

    for (const failure of failures) {
      const content = failure.content.toLowerCase();
      if (content.includes("price") || content.includes("cost"))
        keywords.pricing++;
      if (content.includes("available") || content.includes("schedule"))
        keywords.availability++;
      if (content.includes("unclear") || content.includes("confus"))
        keywords.unclear++;
      if (content.includes("error") || content.includes("problem"))
        keywords.technical++;
    }

    failurePatterns.commonIssues = Object.entries(keywords)
      .filter(([_, count]) => count > 5)
      .map(([issue, count]) => ({
        issue,
        count,
        percentage: `${((count / failures.length) * 100).toFixed(2)}%`,
      }));

    return failurePatterns;
  }

  /**
   * Generate improved prompt based on failure analysis
   */
  async generateImprovedPrompt(variant, failureAnalysis, _trainingData) {
    // This is a placeholder - in production, you would:
    // 1. Use GPT-4 to analyze failures and suggest prompt improvements
    // 2. Or use few-shot learning with successful examples
    // 3. Or manually craft improvements based on patterns

    const improvements = [];

    // Add improvements based on failure patterns
    for (const issue of failureAnalysis.commonIssues) {
      if (issue.issue === "pricing") {
        improvements.push(
          "Be proactive in explaining pricing structure and providing estimates",
        );
      }
      if (issue.issue === "availability") {
        improvements.push(
          "Always check availability before suggesting specific times",
        );
      }
      if (issue.issue === "unclear") {
        improvements.push(
          "Ask clarifying questions when customer intent is ambiguous",
        );
      }
      if (issue.issue === "technical") {
        improvements.push(
          "Handle errors gracefully and offer alternative solutions",
        );
      }
    }

    return {
      variant,
      improvements,
      suggestedChanges: [
        "Add explicit pricing guidance",
        "Improve availability checking flow",
        "Add clarification prompts for ambiguous requests",
      ],
      // In production, this would be the actual new system prompt
      newSystemPrompt: "PLACEHOLDER - would be generated by GPT-4 or manual",
    };
  }

  /**
   * Log retraining session to database
   */
  async logRetrainingSession(session) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO retraining_sessions (
          session_id, variant, version, status, training_data_size,
          failure_analysis, new_variant, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [
          session.id,
          session.variant,
          session.version,
          session.status,
          session.trainingDataSize,
          JSON.stringify(session.failureAnalysis),
          session.newVariant,
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ sessionDbId: this.lastID });
        },
      );

      stmt.finalize();
    }).catch((err) => {
      // Table might not exist yet - that's okay
      if (!err.message.includes("no such table")) {
        console.error("Error logging retraining session:", err);
      }
    });
  }

  /**
   * Get retraining history
   */
  getRetrainingHistory(limit = 10) {
    return this.state.retrainingHistory.slice(-limit).reverse();
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      retrainingInProgress: this.state.retrainingInProgress,
      currentVersion: this.state.currentVersion,
      lastRetrainingTime: this.state.lastRetrainingTime
        ? new Date(this.state.lastRetrainingTime).toISOString()
        : null,
      cooldownActive:
        this.state.lastRetrainingTime &&
        Date.now() - this.state.lastRetrainingTime <
          this.config.retrainingCooldown,
      cooldownEndsAt:
        this.state.lastRetrainingTime &&
        Date.now() - this.state.lastRetrainingTime <
          this.config.retrainingCooldown
          ? new Date(
              this.state.lastRetrainingTime + this.config.retrainingCooldown,
            ).toISOString()
          : null,
      retrainingHistoryCount: this.state.retrainingHistory.length,
    };
  }
}

// Singleton instance
export const retrainingOrchestrator = new RetrainingOrchestrator();
