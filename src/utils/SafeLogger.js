/**
 * Safe Logger
 *
 * Logging system that automatically detects and redacts PII before logging.
 * Ensures no sensitive data is stored in logs or sent to external services.
 */

import { piiDetector } from "./PIIDetector.js";
import { piiRedactor } from "./PIIRedactor.js";
import { getDatabase } from "../database/init.js";

export class SafeLogger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || "cleanspace-ai";
    this.environment = process.env.NODE_ENV || "development";
    this.enablePIIDetection = options.enablePIIDetection !== false;
    this.logLevel = options.logLevel || "INFO";

    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      CRITICAL: 4,
    };

    this.metrics = {
      totalLogs: 0,
      piiDetected: 0,
      byLevel: {},
    };
  }

  /**
   * Log a message with automatic PII detection and redaction
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    this.metrics.totalLogs++;
    this.metrics.byLevel[level] = (this.metrics.byLevel[level] || 0) + 1;

    // Check if we should log this level
    if (this.levels[level] < this.levels[this.logLevel]) {
      return;
    }

    const entry = this.createLogEntry(level, message, metadata);

    // Detect and redact PII
    const safeEntry = this.makeSafe(entry);

    // Output log
    this.output(safeEntry);

    // Store in database if critical or error
    if (level === "ERROR" || level === "CRITICAL") {
      this.persistLog(safeEntry);
    }

    return safeEntry;
  }

  /**
   * Create structured log entry
   * @param {string} level - Log level
   * @param {string} message - Message
   * @param {object} metadata - Metadata
   * @returns {object} Log entry
   */
  createLogEntry(level, message, metadata) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      environment: this.environment,
      ...metadata,
      // Automatic context
      sessionId: metadata.sessionId || this.getCurrentSessionId(),
      requestId: metadata.requestId || this.generateRequestId(),
      userId: metadata.userId,
      // System info
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    };
  }

  /**
   * Make log entry safe by detecting and redacting PII
   * @param {object} entry - Log entry
   * @returns {object} Safe log entry
   */
  makeSafe(entry) {
    if (!this.enablePIIDetection) {
      return entry;
    }

    const safeEntry = { ...entry };
    let piiFound = false;
    const piiLocations = [];

    // Check message for PII
    if (entry.message) {
      const detection = piiDetector.detectPII(entry.message);
      if (detection.hasPII) {
        piiFound = true;
        const redaction = piiRedactor.redact(entry.message);
        safeEntry.message = redaction.redacted;
        piiLocations.push({
          field: "message",
          types: detection.detected.map((d) => d.type),
          riskLevel: detection.riskLevel,
        });
      }
    }

    // Check all string fields in metadata recursively
    safeEntry.metadata = this.redactObject(entry.metadata || entry);

    // Add PII metadata if found
    if (piiFound) {
      this.metrics.piiDetected++;
      safeEntry._piiRedacted = true;
      safeEntry._piiLocations = piiLocations;
      safeEntry._warning = "PII was detected and redacted from this log entry";
    }

    return safeEntry;
  }

  /**
   * Recursively redact PII from object
   * @param {object} obj - Object to redact
   * @returns {object} Redacted object
   */
  redactObject(obj) {
    if (typeof obj !== "object" || obj === null) {
      if (typeof obj === "string") {
        const detection = piiDetector.detectPII(obj);
        if (detection.hasPII) {
          const redaction = piiRedactor.redact(obj);
          return redaction.redacted;
        }
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item));
    }

    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        const detection = piiDetector.detectPII(value);
        if (detection.hasPII) {
          const redaction = piiRedactor.redact(value);
          redacted[key] = redaction.redacted;
        } else {
          redacted[key] = value;
        }
      } else if (typeof value === "object") {
        redacted[key] = this.redactObject(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Output log to console
   * @param {object} entry - Log entry
   */
  output(entry) {
    const formatted = JSON.stringify(entry);

    switch (entry.level) {
      case "DEBUG":
        console.debug(formatted);
        break;
      case "INFO":
        console.info(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "ERROR":
      case "CRITICAL":
        console.error(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  /**
   * Persist log to database
   * @param {object} entry - Log entry
   */
  async persistLog(entry) {
    try {
      const db = getDatabase();

      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO safety_metrics (
            conversation_id, safety_check_type, user_message,
            blocked, violation_type, created_at
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        stmt.run(
          [
            entry.sessionId,
            "logging",
            entry._piiRedacted ? "[PII_REDACTED]" : entry.message,
            entry._piiRedacted ? 1 : 0,
            entry._piiLocations ? JSON.stringify(entry._piiLocations) : null,
          ],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          },
        );

        stmt.finalize();
      });
    } catch (error) {
      // Don't throw - logging should never break the app
      console.error("Failed to persist log:", error.message);
    }
  }

  /**
   * Persist PII detection event to database
   * @param {string} sessionId - Session ID
   * @param {string} source - Source of detection (user_message, ai_response, log)
   * @param {object} detection - PII detection result
   * @param {number} conversationId - Optional conversation ID
   */
  async persistPIIEvent(sessionId, source, detection, conversationId = null) {
    try {
      const db = getDatabase();

      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO pii_events (
            conversation_id, session_id, source, pii_detected,
            pii_types, risk_level, risk_score, redacted_count,
            message_length, context, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        const piiTypes = detection.detected.map((d) => d.type).join(",");
        const context = detection.detected
          .map((d) => `${d.description}: ${d.count}`)
          .join("; ");

        stmt.run(
          [
            conversationId,
            sessionId,
            source,
            detection.hasPII ? 1 : 0,
            piiTypes || null,
            detection.riskLevel,
            detection.riskScore,
            detection.detected.reduce((sum, d) => sum + d.count, 0),
            detection.originalLength || 0,
            context || null,
          ],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          },
        );

        stmt.finalize();
      });

      db.close();
    } catch (error) {
      // Don't throw - logging should never break the app
      console.error("Failed to persist PII event:", error.message);
    }
  }

  /**
   * Convenience methods
   */
  debug(message, metadata) {
    return this.log("DEBUG", message, metadata);
  }

  info(message, metadata) {
    return this.log("INFO", message, metadata);
  }

  warn(message, metadata) {
    return this.log("WARN", message, metadata);
  }

  error(message, errorOrMetadata, metadata = {}) {
    // Support error(msg, error) and error(msg, metadata)
    if (errorOrMetadata instanceof Error) {
      return this.log("ERROR", message, {
        ...metadata,
        error: {
          message: errorOrMetadata.message,
          stack: errorOrMetadata.stack,
          type: errorOrMetadata.constructor.name,
          code: errorOrMetadata.code,
        },
      });
    }

    return this.log("ERROR", message, errorOrMetadata);
  }

  critical(message, metadata) {
    return this.log("CRITICAL", message, metadata);
  }

  /**
   * Log conversation with PII protection
   * @param {string} sessionId - Session ID
   * @param {string} userMessage - User message
   * @param {string} aiResponse - AI response
   * @param {object} metadata - Additional metadata
   */
  async logConversation(sessionId, userMessage, aiResponse, metadata = {}) {
    // Detect PII in user message
    const userDetection = piiDetector.detectPII(userMessage);
    const aiDetection = piiDetector.detectPII(aiResponse);

    // Persist PII events if detected
    if (userDetection.hasPII) {
      await this.persistPIIEvent(
        sessionId,
        "user_message",
        userDetection,
        metadata.conversationId,
      );
    }

    if (aiDetection.hasPII) {
      await this.persistPIIEvent(
        sessionId,
        "ai_response",
        aiDetection,
        metadata.conversationId,
      );
    }

    // Redact if PII found
    const safeUserMessage = userDetection.hasPII
      ? piiRedactor.redactForLogging(userMessage)
      : userMessage;

    const safeAiResponse = aiDetection.hasPII
      ? piiRedactor.redactForLogging(aiResponse)
      : aiResponse;

    return this.info("Conversation logged", {
      sessionId,
      userMessage: safeUserMessage,
      aiResponse: safeAiResponse,
      piiDetected: {
        inUserMessage: userDetection.hasPII,
        inAiResponse: aiDetection.hasPII,
        userRiskLevel: userDetection.riskLevel,
        aiRiskLevel: aiDetection.riskLevel,
      },
      ...metadata,
    });
  }

  /**
   * Get current session ID from context (implement based on your app)
   */
  getCurrentSessionId() {
    // TODO: Implement based on your session management
    return null;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get logger metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      piiDetectionRate:
        this.metrics.totalLogs > 0
          ? (this.metrics.piiDetected / this.metrics.totalLogs) * 100
          : 0,
      piiDetectorMetrics: piiDetector.getMetrics(),
      redactorMetrics: piiRedactor.getMetrics(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalLogs: 0,
      piiDetected: 0,
      byLevel: {},
    };
  }
}

// Singleton instance
export const safeLogger = new SafeLogger();
