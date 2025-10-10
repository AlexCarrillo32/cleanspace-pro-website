/**
 * State Manager
 *
 * Manages workflow execution state:
 * - Initialize and track workflow state
 * - Update step status and results
 * - Persist state to database
 * - Handle state recovery
 */

import crypto from "crypto";
import { getDatabase } from "../database/init.js";

export class StateManager {
  constructor() {
    this.stateCache = new Map(); // In-memory cache for active states
  }

  /**
   * Initialize workflow state
   */
  async initializeState(workflowDef, initialContext = {}) {
    const executionId = this.generateExecutionId();
    const now = new Date().toISOString();

    const state = {
      workflowId: workflowDef.id,
      executionId,
      status: "pending",
      currentStep: null,
      steps: {},
      context: {
        ...initialContext,
        workflowId: workflowDef.id,
        workflowName: workflowDef.name,
      },
      errors: [],
      metadata: {
        startedAt: now,
        updatedAt: now,
        completedAt: null,
      },
    };

    // Initialize step states
    for (const step of workflowDef.steps) {
      state.steps[step.id] = {
        status: "pending",
        startTime: null,
        endTime: null,
        input: null,
        output: null,
        retries: 0,
        error: null,
      };
    }

    // Cache state
    this.stateCache.set(executionId, state);

    // Persist to database
    await this.persistState(state);

    return state;
  }

  /**
   * Start step execution
   */
  async startStep(state, stepId) {
    const stepState = state.steps[stepId];
    if (!stepState) {
      throw new Error(`Step not found: ${stepId}`);
    }

    stepState.status = "in_progress";
    stepState.startTime = new Date().toISOString();
    state.currentStep = stepId;
    state.status = "in_progress";
    state.metadata.updatedAt = new Date().toISOString();

    await this.persistState(state);
  }

  /**
   * Update step result
   */
  async updateStepResult(state, stepId, result) {
    const stepState = state.steps[stepId];
    if (!stepState) {
      throw new Error(`Step not found: ${stepId}`);
    }

    stepState.status = result.success ? "completed" : "failed";
    stepState.endTime = new Date().toISOString();
    stepState.output = result.data;
    stepState.retries = result.attempt || 0;

    if (!result.success) {
      stepState.error = result.error;
      state.errors.push({
        stepId,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }

    state.metadata.updatedAt = new Date().toISOString();

    await this.persistState(state);
  }

  /**
   * Skip step (condition not met)
   */
  async skipStep(state, stepId) {
    const stepState = state.steps[stepId];
    if (!stepState) {
      throw new Error(`Step not found: ${stepId}`);
    }

    stepState.status = "skipped";
    stepState.startTime = new Date().toISOString();
    stepState.endTime = new Date().toISOString();

    state.metadata.updatedAt = new Date().toISOString();

    await this.persistState(state);
  }

  /**
   * Complete workflow
   */
  async completeWorkflow(state) {
    state.status = "completed";
    state.currentStep = null;
    state.metadata.completedAt = new Date().toISOString();
    state.metadata.updatedAt = new Date().toISOString();

    await this.persistState(state);

    // Remove from cache after completion
    setTimeout(() => {
      this.stateCache.delete(state.executionId);
    }, 60000); // Keep for 1 minute
  }

  /**
   * Mark workflow as failed
   */
  async failWorkflow(state, error) {
    state.status = "failed";
    state.metadata.completedAt = new Date().toISOString();
    state.metadata.updatedAt = new Date().toISOString();
    state.errors.push({
      type: "workflow_error",
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    await this.persistState(state);

    // Remove from cache
    setTimeout(() => {
      this.stateCache.delete(state.executionId);
    }, 60000);
  }

  /**
   * Mark for human intervention
   */
  async markForHumanIntervention(state, error) {
    state.status = "needs_human";
    state.metadata.updatedAt = new Date().toISOString();
    state.errors.push({
      type: "human_intervention_required",
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    await this.persistState(state);
  }

  /**
   * Get workflow state
   */
  async getState(executionId) {
    // Check cache first
    if (this.stateCache.has(executionId)) {
      return this.stateCache.get(executionId);
    }

    // Load from database
    return await this.loadState(executionId);
  }

  /**
   * Persist state to database
   */
  async persistState(state) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO workflow_executions (
          id, workflow_id, status, current_step,
          state, context, started_at, completed_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const errorMessage =
        state.errors.length > 0
          ? state.errors[state.errors.length - 1].error
          : null;

      stmt.run(
        [
          state.executionId,
          state.workflowId,
          state.status,
          state.currentStep,
          JSON.stringify(state.steps),
          JSON.stringify(state.context),
          state.metadata.startedAt,
          state.metadata.completedAt,
          errorMessage,
        ],
        function (err) {
          if (err) reject(err);
          else resolve();
        },
      );

      stmt.finalize();
    }).catch((err) => {
      // Table might not exist yet
      if (!err.message.includes("no such table")) {
        console.error("Error persisting workflow state:", err);
      }
    });
  }

  /**
   * Load state from database
   */
  async loadState(executionId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM workflow_executions WHERE id = ?`,
        [executionId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else {
            const state = {
              workflowId: row.workflow_id,
              executionId: row.id,
              status: row.status,
              currentStep: row.current_step,
              steps: JSON.parse(row.state),
              context: JSON.parse(row.context),
              errors: [],
              metadata: {
                startedAt: row.started_at,
                completedAt: row.completed_at,
                updatedAt: row.started_at,
              },
            };

            // Cache loaded state
            this.stateCache.set(executionId, state);
            resolve(state);
          }
        },
      );
    }).catch(() => null);
  }

  /**
   * Get workflow history
   */
  async getWorkflowHistory(workflowId, limit = 10) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM workflow_executions
         WHERE workflow_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
        [workflowId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    }).catch(() => []);
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId() {
    return `wf_exec_${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.stateCache.values()).filter(
      (state) => state.status === "in_progress" || state.status === "pending",
    );
  }

  /**
   * Clear completed workflows from cache
   */
  clearCompletedFromCache() {
    for (const [executionId, state] of this.stateCache.entries()) {
      if (state.status === "completed" || state.status === "failed") {
        this.stateCache.delete(executionId);
      }
    }
  }
}

// Singleton instance
export const stateManager = new StateManager();
