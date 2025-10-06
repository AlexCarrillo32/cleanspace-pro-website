/**
 * Shadow Deployment System
 *
 * Test new AI variants in production without affecting users by:
 * - Running shadow variant alongside primary variant
 * - Comparing responses and metrics
 * - Never showing shadow responses to users
 * - Collecting data for validation
 */

import { getDatabase } from "../database/init.js";

export class ShadowDeployment {
  constructor() {
    this.shadowVariant = null;
    this.primaryVariant = "baseline";
    this.shadowTrafficPercent = 100; // Shadow all requests

    this.metrics = {
      totalRequests: 0,
      shadowExecutions: 0,
      shadowErrors: 0,
      responseDifferences: 0,
      performanceDifferences: [],
    };
  }

  /**
   * Enable shadow deployment
   */
  enable(shadowVariant, trafficPercent = 100) {
    this.shadowVariant = shadowVariant;
    this.shadowTrafficPercent = trafficPercent;
    console.log(
      `🌒 Shadow deployment enabled: ${shadowVariant} (${trafficPercent}% traffic)`,
    );
  }

  /**
   * Disable shadow deployment
   */
  disable() {
    console.log(`🌕 Shadow deployment disabled: ${this.shadowVariant}`);
    this.shadowVariant = null;
  }

  /**
   * Execute with shadow (primary + shadow variant)
   */
  async executeWithShadow(primaryFn, shadowFn, context = {}) {
    this.metrics.totalRequests++;

    // Always execute primary
    const primaryStart = Date.now();
    let primaryResult, primaryError;

    try {
      primaryResult = await primaryFn();
    } catch (error) {
      primaryError = error;
    }

    const primaryDuration = Date.now() - primaryStart;

    // Determine if we should shadow this request
    if (this.shadowVariant && Math.random() * 100 < this.shadowTrafficPercent) {
      this.metrics.shadowExecutions++;

      // Execute shadow (don't wait for it, don't affect primary)
      this.executeShadow(
        shadowFn,
        primaryResult,
        primaryDuration,
        context,
      ).catch((error) => {
        console.error("Shadow execution error (non-blocking):", error.message);
      });
    }

    // Return primary result (or throw primary error)
    if (primaryError) {
      throw primaryError;
    }

    return primaryResult;
  }

  /**
   * Execute shadow variant (async, non-blocking)
   */
  async executeShadow(shadowFn, primaryResult, primaryDuration, context) {
    const shadowStart = Date.now();
    let shadowResult, shadowError;

    try {
      shadowResult = await shadowFn();
    } catch (error) {
      this.metrics.shadowErrors++;
      shadowError = error;
      console.error(`🌒 Shadow variant error: ${error.message}`);
    }

    const shadowDuration = Date.now() - shadowStart;

    // Compare results
    const comparison = this.compareResults(
      primaryResult,
      shadowResult,
      primaryDuration,
      shadowDuration,
      context,
    );

    // Log to database
    await this.logShadowExecution(comparison);

    // Track performance difference
    this.metrics.performanceDifferences.push(shadowDuration - primaryDuration);

    if (comparison.different) {
      this.metrics.responseDifferences++;
      console.warn(
        `🌒 Shadow response differs from primary (${comparison.differenceScore.toFixed(1)}% different)`,
      );
    }
  }

  /**
   * Compare primary and shadow results
   */
  compareResults(
    primaryResult,
    shadowResult,
    primaryDuration,
    shadowDuration,
    context,
  ) {
    const comparison = {
      timestamp: new Date().toISOString(),
      context,
      primary: {
        response: primaryResult?.message,
        action: primaryResult?.action,
        tokens: primaryResult?.metadata?.tokens,
        cost: primaryResult?.metadata?.cost,
        duration: primaryDuration,
      },
      shadow: {
        response: shadowResult?.message,
        action: shadowResult?.action,
        tokens: shadowResult?.metadata?.tokens,
        cost: shadowResult?.metadata?.cost,
        duration: shadowDuration,
      },
      different: false,
      differenceScore: 0,
      performanceDelta: shadowDuration - primaryDuration,
    };

    // Calculate difference score
    let differences = 0;
    let checks = 0;

    if (primaryResult && shadowResult) {
      // Action different?
      if (primaryResult.action !== shadowResult.action) {
        differences++;
      }
      checks++;

      // Response significantly different?
      if (
        this.calculateTextSimilarity(
          primaryResult.message,
          shadowResult.message,
        ) < 0.7
      ) {
        differences++;
      }
      checks++;

      // Cost difference > 50%?
      if (shadowResult.metadata?.cost) {
        const costDiff =
          Math.abs(shadowResult.metadata.cost - primaryResult.metadata.cost) /
          primaryResult.metadata.cost;
        if (costDiff > 0.5) {
          differences++;
        }
        checks++;
      }
    }

    comparison.differenceScore = (differences / checks) * 100;
    comparison.different = comparison.differenceScore > 20;

    return comparison;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Log shadow execution to database
   */
  async logShadowExecution(comparison) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO shadow_comparisons (
          primary_variant, shadow_variant, primary_response,
          shadow_response, primary_duration, shadow_duration,
          different, difference_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [
          this.primaryVariant,
          this.shadowVariant,
          JSON.stringify(comparison.primary),
          JSON.stringify(comparison.shadow),
          comparison.primary.duration,
          comparison.shadow.duration,
          comparison.different ? 1 : 0,
          comparison.differenceScore,
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        },
      );

      stmt.finalize();
    }).catch((err) => {
      // Table might not exist yet - that's okay
      if (!err.message.includes("no such table")) {
        console.error("Error logging shadow execution:", err);
      }
    });
  }

  /**
   * Get shadow metrics
   */
  getMetrics() {
    const avgPerformanceDelta =
      this.metrics.performanceDifferences.length > 0
        ? this.metrics.performanceDifferences.reduce((a, b) => a + b, 0) /
          this.metrics.performanceDifferences.length
        : 0;

    return {
      ...this.metrics,
      shadowTrafficPercent: this.shadowTrafficPercent,
      shadowErrorRate:
        this.metrics.shadowExecutions > 0
          ? (this.metrics.shadowErrors / this.metrics.shadowExecutions) * 100
          : 0,
      responseDifferenceRate:
        this.metrics.shadowExecutions > 0
          ? (this.metrics.responseDifferences / this.metrics.shadowExecutions) *
            100
          : 0,
      avgPerformanceDelta,
    };
  }

  /**
   * Get shadow comparison report
   */
  async getComparisonReport() {
    const db = getDatabase();

    try {
      const comparisons = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM shadow_comparisons
           WHERE shadow_variant = ?
           ORDER BY created_at DESC
           LIMIT 100`,
          [this.shadowVariant],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          },
        );
      });

      const report = {
        shadowVariant: this.shadowVariant,
        totalComparisons: comparisons.length,
        differences: comparisons.filter((c) => c.different).length,
        avgDifferenceScore:
          comparisons.reduce((sum, c) => sum + c.difference_score, 0) /
          comparisons.length,
        avgPerformanceDelta:
          comparisons.reduce(
            (sum, c) => sum + (c.shadow_duration - c.primary_duration),
            0,
          ) / comparisons.length,
        recentComparisons: comparisons.slice(0, 10).map((c) => ({
          timestamp: c.created_at,
          different: c.different === 1,
          differenceScore: c.difference_score,
          performanceDelta: c.shadow_duration - c.primary_duration,
        })),
      };

      return report;
    } catch (error) {
      console.error("Error generating shadow report:", error);
      return null;
    }
  }
}

// Singleton instance
export const shadowDeployment = new ShadowDeployment();
