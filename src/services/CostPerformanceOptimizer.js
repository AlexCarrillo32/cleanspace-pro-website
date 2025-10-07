/**
 * Cost/Performance Optimizer
 *
 * Orchestrates all cost optimization components:
 * - Intelligent routing (model selection)
 * - Request batching
 * - Prompt budgets
 * - Performance monitoring
 *
 * Provides unified optimization layer for AI agent.
 */

import { intelligentRouter } from "./IntelligentRouter.js";
import { requestBatcher } from "./RequestBatcher.js";
import { promptBudgetManager } from "./PromptBudgetManager.js";

export class CostPerformanceOptimizer {
  constructor(options = {}) {
    this.config = {
      // Optimization strategy
      strategy: "cost_optimized", // or "performance_optimized", "balanced"

      // Feature flags
      enableRouting: true,
      enableBatching: true,
      enableBudgets: true,

      // Performance targets
      targetCostPerBooking: 0.005, // $0.005 per booking
      targetBookingRate: 0.75, // 75% booking rate
      targetLatency: 1500, // 1.5s target

      ...options,
    };

    this.metrics = {
      totalRequests: 0,
      totalCost: 0,
      totalBookings: 0,
      avgCostPerRequest: 0,
      avgCostPerBooking: 0,
      avgLatency: 0,
      optimizationSavings: 0,
    };
  }

  /**
   * Optimize request execution
   */
  async optimize(messages, context = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    const optimizationPlan = {
      strategy: this.config.strategy,
      routing: null,
      batching: null,
      budget: null,
      recommendations: [],
    };

    // Step 1: Check budget constraints
    if (this.config.enableBudgets) {
      const budgetCheck = await promptBudgetManager.checkBudget(
        messages,
        context.model,
      );

      optimizationPlan.budget = budgetCheck;

      if (!budgetCheck.withinBudget) {
        return {
          error: "Budget exceeded",
          violations: budgetCheck.violations,
          optimizationPlan,
        };
      }

      // Use trimmed messages if auto-trim was applied
      if (budgetCheck.trimmedMessages) {
        messages = budgetCheck.trimmedMessages;
      }
    }

    // Step 2: Intelligent routing (select optimal model)
    if (this.config.enableRouting) {
      const routing = await intelligentRouter.route(messages, {
        ...context,
        strategy: this.config.strategy,
      });

      optimizationPlan.routing = routing;
      context.selectedModel = routing.model;
    }

    // Step 3: Batching (if enabled)
    if (this.config.enableBatching) {
      optimizationPlan.batching = {
        enabled: true,
        batchSize: requestBatcher.pendingRequests.length + 1,
      };
    }

    // Step 4: Generate recommendations
    optimizationPlan.recommendations =
      this.generateRecommendations(optimizationPlan);

    return {
      success: true,
      optimizationPlan,
      messages, // Potentially trimmed
      context, // Updated with selectedModel
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Update metrics after request completion
   */
  updateMetrics(requestMetrics) {
    const { cost, latency, tokens, bookingCompleted, modelUsed } =
      requestMetrics;

    // Update costs
    this.metrics.totalCost += cost;
    this.metrics.avgCostPerRequest =
      this.metrics.totalCost / this.metrics.totalRequests;

    // Update bookings
    if (bookingCompleted) {
      this.metrics.totalBookings++;
      this.metrics.avgCostPerBooking =
        this.metrics.totalCost / this.metrics.totalBookings;
    }

    // Update latency
    const totalLatency =
      this.metrics.avgLatency * (this.metrics.totalRequests - 1) + latency;
    this.metrics.avgLatency = totalLatency / this.metrics.totalRequests;

    // Update component metrics
    promptBudgetManager.updateMetrics(tokens, cost);
    intelligentRouter.updateMetrics(cost, latency);

    // Calculate savings
    this.calculateSavings();
  }

  /**
   * Calculate optimization savings
   */
  calculateSavings() {
    // Baseline: All requests use balanced model (70B)
    const baselineCostPerRequest = 0.00138; // Avg for 70B model
    const baselineCost = this.metrics.totalRequests * baselineCostPerRequest;

    // Actual savings
    this.metrics.optimizationSavings = baselineCost - this.metrics.totalCost;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(optimizationPlan) {
    const recommendations = [];

    // Check routing
    if (optimizationPlan.routing) {
      const routing = optimizationPlan.routing;

      if (
        routing.model === "balanced" &&
        routing.complexity.level === "simple"
      ) {
        recommendations.push({
          type: "routing",
          priority: "low",
          message:
            "Simple query routed to expensive model - consider adjusting complexity threshold",
        });
      }
    }

    // Check budget
    if (optimizationPlan.budget) {
      const budget = optimizationPlan.budget;

      if (budget.violations.length > 0 && budget.action === "trim") {
        recommendations.push({
          type: "budget",
          priority: "medium",
          message:
            "Context trimmed to fit budget - consider optimizing prompts",
        });
      }
    }

    // Add component recommendations
    recommendations.push(...intelligentRouter.getRecommendations());

    return recommendations;
  }

  /**
   * Get optimization report
   */
  getOptimizationReport() {
    const routingStats = intelligentRouter.getStatistics();
    const batchingStats = requestBatcher.getMetrics();
    const budgetStats = promptBudgetManager.getMetrics();

    // Calculate performance vs targets
    const costPerBookingVsTarget =
      this.metrics.avgCostPerBooking / this.config.targetCostPerBooking;
    const latencyVsTarget = this.metrics.avgLatency / this.config.targetLatency;

    const bookingRate =
      this.metrics.totalRequests > 0
        ? this.metrics.totalBookings / this.metrics.totalRequests
        : 0;
    const bookingRateVsTarget = bookingRate / this.config.targetBookingRate;

    return {
      summary: {
        totalRequests: this.metrics.totalRequests,
        totalCost: `$${this.metrics.totalCost.toFixed(4)}`,
        totalBookings: this.metrics.totalBookings,
        avgCostPerRequest: `$${this.metrics.avgCostPerRequest.toFixed(6)}`,
        avgCostPerBooking: `$${this.metrics.avgCostPerBooking.toFixed(6)}`,
        avgLatency: `${Math.round(this.metrics.avgLatency)}ms`,
        optimizationSavings: `$${this.metrics.optimizationSavings.toFixed(4)}`,
        savingsPercent: `${((this.metrics.optimizationSavings / (this.metrics.totalCost + this.metrics.optimizationSavings)) * 100).toFixed(2)}%`,
      },
      performance: {
        costPerBooking: {
          actual: `$${this.metrics.avgCostPerBooking.toFixed(6)}`,
          target: `$${this.config.targetCostPerBooking.toFixed(6)}`,
          status:
            costPerBookingVsTarget <= 1 ? "✅ On target" : "⚠️ Above target",
          ratio: costPerBookingVsTarget.toFixed(2),
        },
        bookingRate: {
          actual: `${(bookingRate * 100).toFixed(2)}%`,
          target: `${(this.config.targetBookingRate * 100).toFixed(2)}%`,
          status: bookingRateVsTarget >= 1 ? "✅ On target" : "⚠️ Below target",
          ratio: bookingRateVsTarget.toFixed(2),
        },
        latency: {
          actual: `${Math.round(this.metrics.avgLatency)}ms`,
          target: `${this.config.targetLatency}ms`,
          status: latencyVsTarget <= 1 ? "✅ On target" : "⚠️ Above target",
          ratio: latencyVsTarget.toFixed(2),
        },
      },
      components: {
        routing: routingStats,
        batching: batchingStats,
        budgets: budgetStats,
      },
      recommendations: this.getAllRecommendations(),
    };
  }

  /**
   * Get all recommendations from all components
   */
  getAllRecommendations() {
    const recommendations = [];

    // Routing recommendations
    recommendations.push(...intelligentRouter.getRecommendations());

    // Performance recommendations
    if (this.metrics.avgCostPerBooking > this.config.targetCostPerBooking) {
      recommendations.push({
        type: "cost",
        priority: "high",
        message: `Cost per booking ($${this.metrics.avgCostPerBooking.toFixed(6)}) exceeds target ($${this.config.targetCostPerBooking.toFixed(6)})`,
        action: "Route more queries to fast model or optimize prompts",
      });
    }

    if (this.metrics.avgLatency > this.config.targetLatency) {
      recommendations.push({
        type: "latency",
        priority: "medium",
        message: `Average latency (${Math.round(this.metrics.avgLatency)}ms) exceeds target (${this.config.targetLatency}ms)`,
        action: "Use faster model or enable caching",
      });
    }

    // Budget recommendations
    const budgetStatus = promptBudgetManager.getBudgetStatus();
    const dailyUsage = parseFloat(budgetStatus.daily.usage);

    if (dailyUsage > 80) {
      recommendations.push({
        type: "budget",
        priority: "high",
        message: `Daily budget ${dailyUsage.toFixed(1)}% used`,
        action: "Enable more aggressive cost optimization or increase budget",
      });
    }

    return recommendations;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      report: this.getOptimizationReport(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      totalCost: 0,
      totalBookings: 0,
      avgCostPerRequest: 0,
      avgCostPerBooking: 0,
      avgLatency: 0,
      optimizationSavings: 0,
    };
  }
}

// Singleton instance
export const costPerformanceOptimizer = new CostPerformanceOptimizer();
