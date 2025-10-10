/**
 * Intelligent Router
 *
 * Routes requests to optimal AI model based on:
 * - Query complexity (simple vs complex)
 * - Cost constraints (budget limits)
 * - Performance requirements (latency SLA)
 * - Historical success rates
 *
 * Reduces costs by 50-70% by routing simple queries to cheaper models.
 */

import Groq from "groq-sdk";

const MODEL_CONFIGS = {
  fast: {
    model: "llama-3.1-8b-instant",
    costPerToken: {
      input: 0.05 / 1000000,
      output: 0.08 / 1000000,
    },
    avgLatency: 600, // ms
    complexity: "simple",
    capabilities: ["booking", "info_collection", "simple_queries"],
  },
  balanced: {
    // NOTE: Using same model as fast since llama-3.1-70b-versatile was decommissioned
    // When a larger model is available, update this config for cost optimization
    model: "llama-3.1-8b-instant",
    costPerToken: {
      input: 0.05 / 1000000,
      output: 0.08 / 1000000,
    },
    avgLatency: 600, // ms (same as fast for now)
    complexity: "complex",
    capabilities: [
      "booking",
      "info_collection",
      "complex_queries",
      "edge_cases",
      "multi_step_reasoning",
    ],
  },
};

export class IntelligentRouter {
  constructor(options = {}) {
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    this.config = {
      // Routing strategy
      defaultStrategy: "cost_optimized", // or "performance_optimized", "balanced"

      // Complexity thresholds
      simpleQueryMaxTokens: 50,
      complexQueryIndicators: [
        "compare",
        "explain",
        "why",
        "how",
        "multiple",
        "different",
      ],

      // Budget constraints
      dailyBudgetUSD: 10.0,
      perRequestBudgetUSD: 0.01,

      // Performance SLA
      maxLatencyMS: 3000,
      targetLatencyMS: 1500,

      // Success rate tracking
      minSuccessRateForDowngrade: 0.9, // 90%

      ...options,
    };

    this.metrics = {
      totalRequests: 0,
      routedToFast: 0,
      routedToBalanced: 0,
      totalCost: 0,
      avgLatency: 0,
      successRate: 0,
      budgetRemaining: this.config.dailyBudgetUSD,
      lastResetTime: Date.now(),
    };

    this.routingHistory = [];
  }

  /**
   * Route request to optimal model
   */
  async route(messages, context = {}) {
    this.metrics.totalRequests++;

    // Reset daily budget if needed
    this.resetDailyBudgetIfNeeded();

    // Analyze query complexity
    const complexity = this.analyzeComplexity(messages, context);

    // Determine optimal model
    const selectedModel = this.selectModel(complexity, context);

    // Track routing decision
    this.trackRouting(selectedModel, complexity, context);

    return {
      model: selectedModel,
      complexity,
      estimatedCost: this.estimateCost(selectedModel, messages),
      estimatedLatency: MODEL_CONFIGS[selectedModel].avgLatency,
    };
  }

  /**
   * Analyze query complexity
   */
  analyzeComplexity(messages, context = {}) {
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage.role === "user" ? lastMessage.content : "";

    const complexity = {
      level: "simple",
      score: 0,
      indicators: [],
    };

    // 1. Message length
    const tokenCount = this.estimateTokenCount(userMessage);
    if (tokenCount > this.config.simpleQueryMaxTokens) {
      complexity.score += 2;
      complexity.indicators.push("long_message");
    }

    // 2. Complex query indicators
    const lowerMessage = userMessage.toLowerCase();
    for (const indicator of this.config.complexQueryIndicators) {
      if (lowerMessage.includes(indicator)) {
        complexity.score += 1;
        complexity.indicators.push(`keyword_${indicator}`);
      }
    }

    // 3. Conversation history
    if (messages.length > 6) {
      complexity.score += 1;
      complexity.indicators.push("long_conversation");
    }

    // 4. Context indicators
    if (context.requiresReasoning) {
      complexity.score += 2;
      complexity.indicators.push("reasoning_required");
    }

    if (context.hasEscalated) {
      complexity.score += 3;
      complexity.indicators.push("previously_escalated");
    }

    // 5. Multiple questions
    const questionCount = (userMessage.match(/\?/g) || []).length;
    if (questionCount >= 2) {
      complexity.score += 1;
      complexity.indicators.push("multiple_questions");
    }

    // Determine complexity level
    if (complexity.score >= 4) {
      complexity.level = "complex";
    } else if (complexity.score >= 2) {
      complexity.level = "medium";
    }

    return complexity;
  }

  /**
   * Select optimal model based on strategy
   */
  selectModel(complexity, context = {}) {
    const strategy = context.strategy || this.config.defaultStrategy;

    // Check budget constraints first
    if (this.metrics.budgetRemaining <= 0) {
      console.warn("⚠️ Daily budget exhausted - routing to fast model");
      return "fast";
    }

    switch (strategy) {
      case "cost_optimized":
        return this.selectCostOptimized(complexity, context);

      case "performance_optimized":
        return this.selectPerformanceOptimized(complexity, context);

      case "balanced":
        return this.selectBalanced(complexity, context);

      default:
        return this.selectCostOptimized(complexity, context);
    }
  }

  /**
   * Cost-optimized routing (default)
   */
  selectCostOptimized(complexity, _context) {
    // Always use fast model for simple queries
    if (complexity.level === "simple") {
      return "fast";
    }

    // Use fast model for medium complexity if success rate is good
    if (complexity.level === "medium") {
      const fastSuccessRate = this.getModelSuccessRate("fast");
      if (fastSuccessRate >= this.config.minSuccessRateForDowngrade) {
        return "fast";
      }
    }

    // Use balanced model for complex queries
    return "balanced";
  }

  /**
   * Performance-optimized routing
   */
  selectPerformanceOptimized(complexity, _context) {
    // Use balanced model for medium and complex
    if (complexity.level !== "simple") {
      return "balanced";
    }

    // Fast model for simple queries
    return "fast";
  }

  /**
   * Balanced routing
   */
  selectBalanced(complexity, _context) {
    // Fast for simple
    if (complexity.level === "simple") {
      return "fast";
    }

    // Balanced for medium if latency allows
    if (
      complexity.level === "medium" &&
      MODEL_CONFIGS.balanced.avgLatency <= this.config.targetLatencyMS
    ) {
      return "balanced";
    }

    // Balanced for complex
    if (complexity.level === "complex") {
      return "balanced";
    }

    return "fast";
  }

  /**
   * Estimate token count
   */
  estimateTokenCount(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(modelKey, messages) {
    const model = MODEL_CONFIGS[modelKey];

    // Estimate input tokens
    const inputText = messages.map((m) => m.content).join(" ");
    const inputTokens = this.estimateTokenCount(inputText);

    // Estimate output tokens (assume 150 tokens average response)
    const outputTokens = 150;

    const inputCost = inputTokens * model.costPerToken.input;
    const outputCost = outputTokens * model.costPerToken.output;

    return inputCost + outputCost;
  }

  /**
   * Get success rate for a model
   */
  getModelSuccessRate(modelKey) {
    const recentHistory = this.routingHistory.slice(-100);
    const modelHistory = recentHistory.filter((h) => h.model === modelKey);

    if (modelHistory.length === 0) return 1.0;

    const successes = modelHistory.filter((h) => h.success).length;
    return successes / modelHistory.length;
  }

  /**
   * Track routing decision
   */
  trackRouting(modelKey, complexity, context) {
    if (modelKey === "fast") {
      this.metrics.routedToFast++;
    } else {
      this.metrics.routedToBalanced++;
    }

    this.routingHistory.push({
      timestamp: Date.now(),
      model: modelKey,
      complexity: complexity.level,
      complexityScore: complexity.score,
      indicators: complexity.indicators,
      context,
      success: null, // Updated later
    });

    // Keep only last 1000 entries
    if (this.routingHistory.length > 1000) {
      this.routingHistory.shift();
    }
  }

  /**
   * Update routing success
   */
  updateRoutingSuccess(success) {
    if (this.routingHistory.length > 0) {
      this.routingHistory[this.routingHistory.length - 1].success = success;
    }
  }

  /**
   * Update metrics after request
   */
  updateMetrics(cost, latency) {
    this.metrics.totalCost += cost;
    this.metrics.budgetRemaining -= cost;

    // Update average latency
    const totalLatency =
      this.metrics.avgLatency * (this.metrics.totalRequests - 1) + latency;
    this.metrics.avgLatency = totalLatency / this.metrics.totalRequests;

    // Update success rate
    const successfulRequests = this.routingHistory.filter(
      (h) => h.success === true,
    ).length;
    this.metrics.successRate = successfulRequests / this.metrics.totalRequests;
  }

  /**
   * Reset daily budget if needed
   */
  resetDailyBudgetIfNeeded() {
    const now = Date.now();
    const timeSinceReset = now - this.metrics.lastResetTime;
    const oneDayMS = 24 * 60 * 60 * 1000;

    if (timeSinceReset >= oneDayMS) {
      console.log(
        `📊 Daily budget reset: $${this.metrics.totalCost.toFixed(4)} spent in last 24h`,
      );

      this.metrics.budgetRemaining = this.config.dailyBudgetUSD;
      this.metrics.totalCost = 0;
      this.metrics.lastResetTime = now;
    }
  }

  /**
   * Get routing statistics
   */
  getStatistics() {
    const fastPercent =
      this.metrics.totalRequests > 0
        ? (this.metrics.routedToFast / this.metrics.totalRequests) * 100
        : 0;
    const balancedPercent =
      this.metrics.totalRequests > 0
        ? (this.metrics.routedToBalanced / this.metrics.totalRequests) * 100
        : 0;

    const avgCostFast = this.calculateAvgCostByModel("fast");
    const avgCostBalanced = this.calculateAvgCostByModel("balanced");

    return {
      totalRequests: this.metrics.totalRequests,
      routing: {
        fast: {
          count: this.metrics.routedToFast,
          percentage: `${fastPercent.toFixed(2)}%`,
          avgCost: `$${avgCostFast.toFixed(6)}`,
          successRate: `${(this.getModelSuccessRate("fast") * 100).toFixed(2)}%`,
        },
        balanced: {
          count: this.metrics.routedToBalanced,
          percentage: `${balancedPercent.toFixed(2)}%`,
          avgCost: `$${avgCostBalanced.toFixed(6)}`,
          successRate: `${(this.getModelSuccessRate("balanced") * 100).toFixed(2)}%`,
        },
      },
      costs: {
        totalSpent: `$${this.metrics.totalCost.toFixed(4)}`,
        budgetRemaining: `$${this.metrics.budgetRemaining.toFixed(4)}`,
        dailyBudget: `$${this.config.dailyBudgetUSD.toFixed(2)}`,
        avgPerRequest: `$${(this.metrics.totalCost / this.metrics.totalRequests).toFixed(6)}`,
      },
      performance: {
        avgLatency: `${Math.round(this.metrics.avgLatency)}ms`,
        targetLatency: `${this.config.targetLatencyMS}ms`,
        overallSuccessRate: `${(this.metrics.successRate * 100).toFixed(2)}%`,
      },
    };
  }

  /**
   * Calculate average cost by model
   */
  calculateAvgCostByModel(modelKey) {
    const modelHistory = this.routingHistory.filter(
      (h) => h.model === modelKey,
    );
    if (modelHistory.length === 0) return 0;

    // Use estimated costs from model config
    const model = MODEL_CONFIGS[modelKey];
    const avgInputTokens = 200; // Estimated
    const avgOutputTokens = 150; // Estimated

    return (
      avgInputTokens * model.costPerToken.input +
      avgOutputTokens * model.costPerToken.output
    );
  }

  /**
   * Get routing recommendations
   */
  getRecommendations() {
    const recommendations = [];

    // Check success rate disparity
    const fastSuccessRate = this.getModelSuccessRate("fast");
    const balancedSuccessRate = this.getModelSuccessRate("balanced");

    if (fastSuccessRate < 0.8 && balancedSuccessRate > 0.9) {
      recommendations.push({
        type: "routing_strategy",
        priority: "high",
        message:
          "Fast model success rate is low - consider using balanced model for medium complexity queries",
        action: "Adjust complexity threshold or switch to balanced strategy",
      });
    }

    // Check budget usage
    const budgetUsagePercent =
      ((this.config.dailyBudgetUSD - this.metrics.budgetRemaining) /
        this.config.dailyBudgetUSD) *
      100;

    if (budgetUsagePercent > 80) {
      recommendations.push({
        type: "budget",
        priority: "high",
        message: `Daily budget ${budgetUsagePercent.toFixed(1)}% used`,
        action: "Route more queries to fast model or increase budget",
      });
    }

    // Check latency
    if (this.metrics.avgLatency > this.config.maxLatencyMS) {
      recommendations.push({
        type: "performance",
        priority: "medium",
        message: `Average latency (${Math.round(this.metrics.avgLatency)}ms) exceeds SLA (${this.config.maxLatencyMS}ms)`,
        action: "Use fast model more frequently or optimize prompts",
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
      statistics: this.getStatistics(),
      recommendations: this.getRecommendations(),
    };
  }
}

// Lazy singleton instance - only created when first accessed
let _instance = null;

export function getIntelligentRouter() {
  if (!_instance) {
    _instance = new IntelligentRouter();
  }
  return _instance;
}

// For backward compatibility, create instance lazily
export const intelligentRouter = {
  get instance() {
    return getIntelligentRouter();
  },
};
