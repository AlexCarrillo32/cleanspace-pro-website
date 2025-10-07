/**
 * Prompt Budget Manager
 *
 * Enforces token and cost budgets on prompts to:
 * - Prevent runaway costs
 * - Ensure prompts stay within limits
 * - Trim context when necessary
 * - Alert when budgets are exceeded
 *
 * Protects against unexpected cost spikes.
 */

export class PromptBudgetManager {
  constructor(options = {}) {
    this.config = {
      // Token budgets
      maxInputTokens: 2000, // Max input tokens per request
      maxOutputTokens: 500, // Max output tokens per request
      maxTotalTokens: 2500, // Max total tokens per request

      // Cost budgets
      maxCostPerRequest: 0.01, // $0.01 per request
      maxDailyCost: 10.0, // $10/day
      maxMonthlyCost: 300.0, // $300/month

      // Context trimming
      enableAutoTrim: true,
      maxConversationHistory: 10, // Max messages in history
      minConversationHistory: 2, // Min messages to keep

      // Alerts
      enableAlerts: true,
      alertThreshold: 0.8, // Alert at 80% of budget

      ...options,
    };

    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      trimmedRequests: 0,
      totalTokensUsed: 0,
      totalCostUSD: 0,
      dailyCostUSD: 0,
      monthlyCostUSD: 0,
      lastResetDaily: Date.now(),
      lastResetMonthly: Date.now(),
    };

    this.budgetAlerts = [];
  }

  /**
   * Check if request is within budget
   */
  async checkBudget(messages, model = "llama-3.1-8b-instant") {
    this.metrics.totalRequests++;

    // Reset budgets if needed
    this.resetBudgetsIfNeeded();

    // Estimate tokens
    const inputTokens = this.estimateInputTokens(messages);
    const outputTokens = this.config.maxOutputTokens; // Use max for safety

    // Estimate cost
    const estimatedCost = this.estimateCost(model, inputTokens, outputTokens);

    const budgetCheck = {
      withinBudget: true,
      violations: [],
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost,
      action: null,
      trimmedMessages: null,
    };

    // Check per-request token budget
    if (inputTokens > this.config.maxInputTokens) {
      budgetCheck.violations.push({
        type: "input_tokens",
        limit: this.config.maxInputTokens,
        actual: inputTokens,
        excess: inputTokens - this.config.maxInputTokens,
      });

      if (this.config.enableAutoTrim) {
        budgetCheck.action = "trim";
        budgetCheck.trimmedMessages = this.trimMessages(
          messages,
          this.config.maxInputTokens,
        );
        budgetCheck.withinBudget = true; // Can proceed with trimmed messages
        this.metrics.trimmedRequests++;
      } else {
        budgetCheck.withinBudget = false;
      }
    }

    // Check total token budget
    const totalTokens = inputTokens + outputTokens;
    if (totalTokens > this.config.maxTotalTokens) {
      budgetCheck.violations.push({
        type: "total_tokens",
        limit: this.config.maxTotalTokens,
        actual: totalTokens,
        excess: totalTokens - this.config.maxTotalTokens,
      });

      if (!this.config.enableAutoTrim) {
        budgetCheck.withinBudget = false;
      }
    }

    // Check per-request cost budget
    if (estimatedCost > this.config.maxCostPerRequest) {
      budgetCheck.violations.push({
        type: "request_cost",
        limit: this.config.maxCostPerRequest,
        actual: estimatedCost,
        excess: estimatedCost - this.config.maxCostPerRequest,
      });
      budgetCheck.withinBudget = false;
    }

    // Check daily cost budget
    if (this.metrics.dailyCostUSD + estimatedCost > this.config.maxDailyCost) {
      budgetCheck.violations.push({
        type: "daily_cost",
        limit: this.config.maxDailyCost,
        actual: this.metrics.dailyCostUSD + estimatedCost,
        remaining: this.config.maxDailyCost - this.metrics.dailyCostUSD,
      });
      budgetCheck.withinBudget = false;
    }

    // Check monthly cost budget
    if (
      this.metrics.monthlyCostUSD + estimatedCost >
      this.config.maxMonthlyCost
    ) {
      budgetCheck.violations.push({
        type: "monthly_cost",
        limit: this.config.maxMonthlyCost,
        actual: this.metrics.monthlyCostUSD + estimatedCost,
        remaining: this.config.maxMonthlyCost - this.metrics.monthlyCostUSD,
      });
      budgetCheck.withinBudget = false;
    }

    // Alert if approaching limits
    if (this.config.enableAlerts) {
      this.checkAlerts(budgetCheck);
    }

    // Block if over budget
    if (!budgetCheck.withinBudget) {
      this.metrics.blockedRequests++;
      console.error(
        `🚫 Request blocked: ${budgetCheck.violations.map((v) => v.type).join(", ")}`,
      );
    }

    return budgetCheck;
  }

  /**
   * Estimate input tokens
   */
  estimateInputTokens(messages) {
    const text = messages.map((m) => m.content).join(" ");
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost
   */
  estimateCost(model, inputTokens, outputTokens) {
    const pricing = {
      "llama-3.1-8b-instant": {
        input: 0.05 / 1000000,
        output: 0.08 / 1000000,
      },
      "llama-3.1-70b-versatile": {
        input: 0.59 / 1000000,
        output: 0.79 / 1000000,
      },
    };

    const modelPricing = pricing[model] || pricing["llama-3.1-8b-instant"];

    return (
      inputTokens * modelPricing.input + outputTokens * modelPricing.output
    );
  }

  /**
   * Trim messages to fit within budget
   */
  trimMessages(messages, maxTokens) {
    // Always keep system prompt (first message)
    const systemPrompt = messages[0];
    const userMessages = messages.slice(1);

    // Keep last N messages
    let trimmedMessages = [systemPrompt];
    let currentTokens = this.estimateInputTokens([systemPrompt]);

    // Add messages from most recent backwards
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const message = userMessages[i];
      const messageTokens = this.estimateInputTokens([message]);

      if (currentTokens + messageTokens <= maxTokens) {
        trimmedMessages.splice(1, 0, message); // Insert after system prompt
        currentTokens += messageTokens;
      } else {
        break;
      }
    }

    // Ensure minimum conversation history
    if (trimmedMessages.length - 1 < this.config.minConversationHistory) {
      // Keep at least min messages
      trimmedMessages = [
        systemPrompt,
        ...userMessages.slice(-this.config.minConversationHistory),
      ];
    }

    console.log(
      `✂️ Trimmed messages: ${messages.length} → ${trimmedMessages.length}`,
    );

    return trimmedMessages;
  }

  /**
   * Update metrics after request
   */
  updateMetrics(actualTokens, actualCost) {
    this.metrics.totalTokensUsed += actualTokens;
    this.metrics.totalCostUSD += actualCost;
    this.metrics.dailyCostUSD += actualCost;
    this.metrics.monthlyCostUSD += actualCost;
  }

  /**
   * Check for alerts
   */
  checkAlerts(budgetCheck) {
    const alerts = [];

    // Daily cost alert
    const dailyUsagePercent =
      this.metrics.dailyCostUSD / this.config.maxDailyCost;
    if (
      dailyUsagePercent >= this.config.alertThreshold &&
      dailyUsagePercent < 1.0
    ) {
      alerts.push({
        type: "daily_cost",
        severity: "warning",
        message: `Daily budget ${(dailyUsagePercent * 100).toFixed(1)}% used ($${this.metrics.dailyCostUSD.toFixed(2)}/$${this.config.maxDailyCost})`,
      });
    }

    // Monthly cost alert
    const monthlyUsagePercent =
      this.metrics.monthlyCostUSD / this.config.maxMonthlyCost;
    if (
      monthlyUsagePercent >= this.config.alertThreshold &&
      monthlyUsagePercent < 1.0
    ) {
      alerts.push({
        type: "monthly_cost",
        severity: "warning",
        message: `Monthly budget ${(monthlyUsagePercent * 100).toFixed(1)}% used ($${this.metrics.monthlyCostUSD.toFixed(2)}/$${this.config.maxMonthlyCost})`,
      });
    }

    // Add to alert history
    if (alerts.length > 0) {
      this.budgetAlerts.push({
        timestamp: new Date().toISOString(),
        alerts,
      });

      // Keep only last 100 alerts
      if (this.budgetAlerts.length > 100) {
        this.budgetAlerts.shift();
      }

      // Log alerts
      alerts.forEach((alert) => {
        console.warn(`⚠️ ${alert.message}`);
      });
    }
  }

  /**
   * Reset budgets if needed
   */
  resetBudgetsIfNeeded() {
    const now = Date.now();

    // Reset daily budget
    if (now - this.metrics.lastResetDaily >= 24 * 60 * 60 * 1000) {
      console.log(
        `📊 Daily budget reset: $${this.metrics.dailyCostUSD.toFixed(4)} spent`,
      );
      this.metrics.dailyCostUSD = 0;
      this.metrics.lastResetDaily = now;
    }

    // Reset monthly budget
    if (now - this.metrics.lastResetMonthly >= 30 * 24 * 60 * 60 * 1000) {
      console.log(
        `📊 Monthly budget reset: $${this.metrics.monthlyCostUSD.toFixed(2)} spent`,
      );
      this.metrics.monthlyCostUSD = 0;
      this.metrics.lastResetMonthly = now;
    }
  }

  /**
   * Get budget status
   */
  getBudgetStatus() {
    this.resetBudgetsIfNeeded();

    return {
      daily: {
        spent: `$${this.metrics.dailyCostUSD.toFixed(4)}`,
        limit: `$${this.config.maxDailyCost.toFixed(2)}`,
        remaining: `$${(this.config.maxDailyCost - this.metrics.dailyCostUSD).toFixed(4)}`,
        usage: `${((this.metrics.dailyCostUSD / this.config.maxDailyCost) * 100).toFixed(2)}%`,
      },
      monthly: {
        spent: `$${this.metrics.monthlyCostUSD.toFixed(2)}`,
        limit: `$${this.config.maxMonthlyCost.toFixed(2)}`,
        remaining: `$${(this.config.maxMonthlyCost - this.metrics.monthlyCostUSD).toFixed(2)}`,
        usage: `${((this.metrics.monthlyCostUSD / this.config.maxMonthlyCost) * 100).toFixed(2)}%`,
      },
      perRequest: {
        limit: `$${this.config.maxCostPerRequest.toFixed(6)}`,
        avgActual: `$${(this.metrics.totalCostUSD / this.metrics.totalRequests).toFixed(6)}`,
      },
      tokens: {
        maxInput: this.config.maxInputTokens,
        maxOutput: this.config.maxOutputTokens,
        maxTotal: this.config.maxTotalTokens,
        totalUsed: this.metrics.totalTokensUsed,
      },
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    const blockRate =
      this.metrics.totalRequests > 0
        ? (this.metrics.blockedRequests / this.metrics.totalRequests) * 100
        : 0;
    const trimRate =
      this.metrics.totalRequests > 0
        ? (this.metrics.trimmedRequests / this.metrics.totalRequests) * 100
        : 0;

    return {
      totalRequests: this.metrics.totalRequests,
      blockedRequests: this.metrics.blockedRequests,
      trimmedRequests: this.metrics.trimmedRequests,
      blockRate: `${blockRate.toFixed(2)}%`,
      trimRate: `${trimRate.toFixed(2)}%`,
      totalTokensUsed: this.metrics.totalTokensUsed,
      totalCostUSD: `$${this.metrics.totalCostUSD.toFixed(4)}`,
      budgetStatus: this.getBudgetStatus(),
      recentAlerts: this.budgetAlerts.slice(-10),
    };
  }
}

// Singleton instance
export const promptBudgetManager = new PromptBudgetManager();
