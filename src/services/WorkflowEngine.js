/**
 * Workflow Engine
 *
 * Orchestrates multi-step workflows with:
 * - Sequential and parallel step execution
 * - Conditional branching
 * - State management and persistence
 * - Error recovery with retries
 * - Agent coordination
 */

import { stateManager } from "./StateManager.js";

export class WorkflowEngine {
  constructor(options = {}) {
    this.config = {
      // Execution settings
      maxStepsPerWorkflow: 20,
      defaultTimeout: 30000, // 30 seconds per step
      maxRetries: 3,
      retryDelay: 1000, // 1 second base delay

      // State settings
      persistState: true,
      stateUpdateInterval: 1000, // Update state every 1s

      ...options,
    };

    this.agents = new Map(); // Registered agents
    this.activeWorkflows = new Map(); // Currently executing workflows
    this.metrics = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      avgExecutionTime: 0,
    };
  }

  /**
   * Register an agent for workflow execution
   */
  registerAgent(agentId, agentInstance) {
    this.agents.set(agentId, agentInstance);
    console.log(`📝 Registered agent: ${agentId}`);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowDef, initialContext = {}) {
    const startTime = Date.now();
    this.metrics.totalWorkflows++;

    // Validate workflow definition
    this.validateWorkflow(workflowDef);

    // Initialize workflow state
    const state = await stateManager.initializeState(
      workflowDef,
      initialContext,
    );
    this.activeWorkflows.set(state.executionId, state);

    console.log(
      `🚀 Starting workflow: ${workflowDef.name} (${state.executionId})`,
    );

    try {
      // Execute workflow steps
      for (const step of workflowDef.steps) {
        // Check if should execute step (conditional logic)
        if (!this.shouldExecuteStep(step, state)) {
          console.log(`⏭️  Skipping step: ${step.name} (condition not met)`);
          await stateManager.skipStep(state, step.id);
          continue;
        }

        // Execute step with retry logic
        const stepResult = await this.executeStepWithRetry(step, state);

        // Update state with step result
        await stateManager.updateStepResult(state, step.id, stepResult);

        // Check for early termination
        if (stepResult.terminate) {
          console.log(
            `🛑 Workflow terminated early by step: ${step.name} (${stepResult.reason})`,
          );
          break;
        }
      }

      // Mark workflow as completed
      await stateManager.completeWorkflow(state);
      this.metrics.completedWorkflows++;

      const executionTime = Date.now() - startTime;
      this.updateAvgExecutionTime(executionTime);

      console.log(
        `✅ Workflow completed: ${workflowDef.name} (${executionTime}ms)`,
      );

      return {
        success: true,
        executionId: state.executionId,
        state,
        executionTime,
      };
    } catch (error) {
      // Mark workflow as failed
      await stateManager.failWorkflow(state, error);
      this.metrics.failedWorkflows++;

      console.error(
        `❌ Workflow failed: ${workflowDef.name} - ${error.message}`,
      );

      // Handle error based on workflow error strategy
      return this.handleWorkflowError(workflowDef, state, error);
    } finally {
      this.activeWorkflows.delete(state.executionId);
    }
  }

  /**
   * Execute a single step with retry logic
   */
  async executeStepWithRetry(step, state) {
    const maxRetries = step.retries ?? this.config.maxRetries;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔄 Executing step: ${step.name} (attempt ${attempt + 1}/${maxRetries + 1})`,
        );

        // Mark step as in progress
        await stateManager.startStep(state, step.id);

        // Execute step
        const result = await this.executeStep(step, state);

        return {
          success: true,
          data: result,
          attempt,
        };
      } catch (error) {
        lastError = error;
        console.warn(
          `⚠️  Step failed: ${step.name} (attempt ${attempt + 1}) - ${error.message}`,
        );

        // If retries remaining, wait before retry
        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `Step ${step.name} failed after ${maxRetries + 1} attempts: ${lastError.message}`,
    );
  }

  /**
   * Execute a single step
   */
  async executeStep(step, state) {
    // Get agent for this step
    const agent = this.agents.get(step.agent);
    if (!agent) {
      throw new Error(`Agent not found: ${step.agent}`);
    }

    // Prepare input from state context
    const input = this.prepareStepInput(step, state);

    // Set timeout
    const timeout = step.timeout ?? this.config.defaultTimeout;

    // Execute agent with timeout
    const result = await this.executeWithTimeout(
      () => agent.execute(input, state.context),
      timeout,
      `Step ${step.name} timed out after ${timeout}ms`,
    );

    // Validate output
    this.validateStepOutput(step, result);

    // Merge output into context
    this.mergeOutputToContext(step, result, state);

    return result;
  }

  /**
   * Check if step should be executed based on condition
   */
  shouldExecuteStep(step, state) {
    if (!step.condition) return true;

    try {
      // Evaluate condition (simple expression evaluation)
      // For safety, we use a limited evaluator
      return this.evaluateCondition(step.condition, state.context);
    } catch (error) {
      console.warn(
        `⚠️  Condition evaluation error for step ${step.name}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Evaluate a condition against context
   * Simple expression evaluator for conditions like "is_qualified === true"
   */
  evaluateCondition(condition, context) {
    // Parse simple conditions: "field === value" or "field !== value"
    const eqMatch = condition.match(/^(\w+)\s*===\s*(.+)$/);
    const neqMatch = condition.match(/^(\w+)\s*!==\s*(.+)$/);

    if (eqMatch) {
      const [, field, value] = eqMatch;
      const contextValue = context[field];
      const expectedValue = this.parseValue(value);
      return contextValue === expectedValue;
    }

    if (neqMatch) {
      const [, field, value] = neqMatch;
      const contextValue = context[field];
      const expectedValue = this.parseValue(value);
      return contextValue !== expectedValue;
    }

    // Default: treat as truthy check
    return !!context[condition];
  }

  /**
   * Parse a value from condition string
   */
  parseValue(value) {
    const trimmed = value.trim();

    // Boolean
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    // Number
    if (!isNaN(trimmed)) return Number(trimmed);

    // String (remove quotes)
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  /**
   * Prepare input for step from state
   */
  prepareStepInput(step, state) {
    const input = {};

    // Extract required inputs from context
    if (step.input && Array.isArray(step.input)) {
      for (const key of step.input) {
        if (state.context[key] !== undefined) {
          input[key] = state.context[key];
        }
      }
    }

    return input;
  }

  /**
   * Merge step output to context
   */
  mergeOutputToContext(step, result, state) {
    if (step.output && Array.isArray(step.output)) {
      for (const key of step.output) {
        if (result[key] !== undefined) {
          state.context[key] = result[key];
        }
      }
    } else {
      // If no specific outputs defined, merge all result keys
      Object.assign(state.context, result);
    }
  }

  /**
   * Validate step output
   */
  validateStepOutput(step, result) {
    if (!result || typeof result !== "object") {
      throw new Error(`Step ${step.name} returned invalid output`);
    }

    // Check required outputs
    if (step.output && Array.isArray(step.output)) {
      for (const key of step.output) {
        if (result[key] === undefined) {
          throw new Error(`Step ${step.name} missing required output: ${key}`);
        }
      }
    }
  }

  /**
   * Validate workflow definition
   */
  validateWorkflow(workflowDef) {
    if (!workflowDef.id) {
      throw new Error("Workflow must have an id");
    }

    if (!workflowDef.name) {
      throw new Error("Workflow must have a name");
    }

    if (!Array.isArray(workflowDef.steps) || workflowDef.steps.length === 0) {
      throw new Error("Workflow must have at least one step");
    }

    if (workflowDef.steps.length > this.config.maxStepsPerWorkflow) {
      throw new Error(
        `Workflow exceeds max steps: ${this.config.maxStepsPerWorkflow}`,
      );
    }

    // Validate each step
    for (const step of workflowDef.steps) {
      if (!step.id) throw new Error("Step must have an id");
      if (!step.name) throw new Error("Step must have a name");
      if (!step.agent) throw new Error("Step must specify an agent");
    }
  }

  /**
   * Handle workflow error based on error handling strategy
   */
  async handleWorkflowError(workflowDef, state, error) {
    const errorHandling = workflowDef.errorHandling || {};

    // Check for fallback workflow
    if (errorHandling.fallbackWorkflow) {
      console.log(
        `🔄 Attempting fallback workflow: ${errorHandling.fallbackWorkflow}`,
      );
      // Note: Would load and execute fallback workflow here
      // For now, just log
    }

    // Notify human if configured
    if (errorHandling.onError === "notify_human") {
      console.log("📢 Notifying human agent for intervention");
      await stateManager.markForHumanIntervention(state, error);
    }

    return {
      success: false,
      executionId: state.executionId,
      error: error.message,
      state,
    };
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeout, timeoutMessage) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeout),
      ),
    ]);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt) {
    return this.config.retryDelay * Math.pow(2, attempt);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update average execution time
   */
  updateAvgExecutionTime(executionTime) {
    const total =
      this.metrics.avgExecutionTime * this.metrics.completedWorkflows;
    this.metrics.avgExecutionTime = total + executionTime;
    this.metrics.avgExecutionTime /= this.metrics.completedWorkflows;
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(executionId) {
    // Check active workflows
    if (this.activeWorkflows.has(executionId)) {
      return this.activeWorkflows.get(executionId);
    }

    // Check persisted state
    return await stateManager.getState(executionId);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeWorkflows: this.activeWorkflows.size,
      registeredAgents: this.agents.size,
      successRate:
        this.metrics.totalWorkflows > 0
          ? (
              (this.metrics.completedWorkflows / this.metrics.totalWorkflows) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }
}

// Singleton instance
export const workflowEngine = new WorkflowEngine();
