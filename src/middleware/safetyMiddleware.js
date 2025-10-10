/**
 * Safety Middleware
 *
 * Multi-layer safety checks for user messages:
 * 1. Input validation
 * 2. PII detection (warn if HIGH risk)
 * 3. Jailbreak detection
 * 4. Content safety (prompt injection, toxic content)
 *
 * Blocks unsafe messages and logs all safety events.
 */

import { piiDetector } from "../utils/PIIDetector.js";
import { piiRedactor } from "../utils/PIIRedactor.js";
import { jailbreakDetector } from "../utils/JailbreakDetector.js";
import { contentSafety } from "../utils/AIContentSafety.js";
import { safeLogger } from "../utils/SafeLogger.js";

/**
 * Safety check middleware for chat messages
 */
export function safetyCheck(req, res, next) {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid message",
    });
  }

  const safetyResults = {
    safe: true,
    layers: {},
    blockedBy: null,
    message: null,
  };

  // Layer 1: Input validation
  const inputValidation = validateInput(message);
  safetyResults.layers.inputValidation = inputValidation;

  if (!inputValidation.safe) {
    safetyResults.safe = false;
    safetyResults.blockedBy = "inputValidation";
    safetyResults.message =
      "Your message contains invalid characters or is too long. Please try again.";

    safeLogger.warn("Input validation failed", {
      sessionId,
      reason: inputValidation.reason,
      messageLength: message.length,
    });

    return res.status(400).json({
      success: false,
      error: safetyResults.message,
      safetyCheck: {
        blocked: true,
        reason: inputValidation.reason,
      },
    });
  }

  // Layer 2: PII detection (warn only, don't block)
  const piiCheck = piiDetector.detectPII(message);
  safetyResults.layers.piiDetection = piiCheck;

  if (piiCheck.hasPII) {
    safeLogger.warn("PII detected in user message", {
      sessionId,
      riskLevel: piiCheck.riskLevel,
      piiTypes: piiCheck.detected.map((d) => d.type),
    });

    // Only block if CRITICAL risk (SSN + CC or similar)
    if (piiCheck.riskLevel === "CRITICAL") {
      safetyResults.safe = false;
      safetyResults.blockedBy = "piiDetection";
      safetyResults.message =
        "For your security, please don't share sensitive information like social security numbers or credit card details in chat. Our team will collect payment information securely when needed.";

      return res.status(400).json({
        success: false,
        error: safetyResults.message,
        safetyCheck: {
          blocked: true,
          reason: "critical_pii_detected",
          riskLevel: piiCheck.riskLevel,
        },
      });
    }

    // For HIGH risk, warn but allow (will be redacted in logs)
    if (piiCheck.riskLevel === "HIGH") {
      req.piiWarning = {
        detected: true,
        riskLevel: piiCheck.riskLevel,
        types: piiCheck.detected.map((d) => d.type),
      };
    }
  }

  // Layer 3: Jailbreak detection
  const jailbreakCheck = jailbreakDetector.detect(message, sessionId);
  safetyResults.layers.jailbreakDetection = jailbreakCheck;

  if (jailbreakCheck.isJailbreak) {
    safetyResults.safe = false;
    safetyResults.blockedBy = "jailbreakDetection";

    safeLogger.error("Jailbreak attempt detected", {
      sessionId,
      severity: jailbreakCheck.severity,
      detectionTypes: jailbreakCheck.detected.map((d) => d.type),
      confidence: jailbreakCheck.confidence,
    });

    // Different responses based on severity
    if (jailbreakCheck.severity === "CRITICAL") {
      safetyResults.message =
        "Your message has been flagged for violating our usage policy. If you believe this is an error, please contact support.";
    } else if (jailbreakCheck.severity === "HIGH") {
      safetyResults.message =
        "I can only help with scheduling cleaning services. Please keep your questions focused on our services.";
    } else {
      safetyResults.message =
        "I'm here to help with cleaning appointments and estimates. How can I assist you with that?";
    }

    return res.status(400).json({
      success: false,
      error: safetyResults.message,
      safetyCheck: {
        blocked: true,
        reason: "jailbreak_attempt",
        severity: jailbreakCheck.severity,
      },
    });
  }

  // Layer 4: Content safety (prompt injection, toxic content, off-topic)
  const contentCheck = contentSafety.checkSafety(message);
  safetyResults.layers.contentSafety = contentCheck;

  if (!contentCheck.safe) {
    safetyResults.safe = false;
    safetyResults.blockedBy = "contentSafety";
    safetyResults.message = contentCheck.blockedReason;

    safeLogger.warn("Content safety violation", {
      sessionId,
      violationType: contentCheck.violations[0]?.type,
      violations: contentCheck.violations.length,
    });

    return res.status(400).json({
      success: false,
      error: safetyResults.message,
      safetyCheck: {
        blocked: true,
        reason: "content_safety_violation",
        violationType: contentCheck.violations[0]?.type,
      },
    });
  }

  // All checks passed - attach safety results to request
  req.safetyCheck = safetyResults;

  // Store redacted message for logging
  if (piiCheck.hasPII) {
    req.redactedMessage = piiRedactor.redactForLogging(message);
  }

  next();
}

/**
 * Validate input for suspicious patterns
 */
function validateInput(message) {
  // Length limits
  if (message.length > 5000) {
    return { safe: false, reason: "message_too_long" };
  }

  if (message.length < 1) {
    return { safe: false, reason: "message_empty" };
  }

  // Check for control characters
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  if (controlChars.test(message)) {
    return { safe: false, reason: "invalid_characters" };
  }

  // Check for excessive special characters (potential encoding attack)
  const specialCharRatio =
    (message.match(/[^a-zA-Z0-9\s.,!?'"()-]/g) || []).length / message.length;
  if (specialCharRatio > 0.5 && message.length > 20) {
    return { safe: false, reason: "suspicious_encoding" };
  }

  return { safe: true };
}

/**
 * Response safety check - ensures AI doesn't leak sensitive info
 */
export function responseSafetyCheck(aiResponse) {
  // Check for system prompt leaks
  const responseCheck = contentSafety.checkResponseSafety(aiResponse);

  if (!responseCheck.safe) {
    safeLogger.error("AI response safety violation", {
      reason: responseCheck.reason,
    });

    return {
      safe: false,
      sanitizedResponse: responseCheck.sanitizedMessage,
    };
  }

  // Check for PII in response
  const piiCheck = piiDetector.detectPII(aiResponse);
  if (piiCheck.hasPII && piiCheck.riskLevel !== "LOW") {
    // Redact PII from response
    const redaction = piiRedactor.redact(aiResponse);

    safeLogger.warn("PII detected in AI response, redacting", {
      riskLevel: piiCheck.riskLevel,
      types: piiCheck.detected.map((d) => d.type),
    });

    return {
      safe: true,
      sanitizedResponse: redaction.redacted,
      piiRedacted: true,
    };
  }

  return {
    safe: true,
    sanitizedResponse: aiResponse,
  };
}
