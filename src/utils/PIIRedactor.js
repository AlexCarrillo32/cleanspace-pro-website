/**
 * PII Redactor
 *
 * Redacts personally identifiable information from text while maintaining
 * readability and context. Supports full and partial redaction strategies.
 */

import { PIIDetector } from "./PIIDetector.js";

export class PIIRedactor {
  constructor() {
    this.detector = new PIIDetector();

    this.redactionMasks = {
      email: "[EMAIL_REDACTED]",
      phone: "[PHONE_REDACTED]",
      ssn: "[SSN_REDACTED]",
      creditCard: "[CC_REDACTED]",
      address: "[ADDRESS_REDACTED]",
      zipCode: "[ZIP_REDACTED]",
      ipAddress: "[IP_REDACTED]",
      potentialName: "[NAME_REDACTED]",
    };

    this.metrics = {
      totalRedactions: 0,
      byType: {},
    };
  }

  /**
   * Redact PII from text (full redaction)
   * @param {string} text - Text to redact
   * @param {object} options - Redaction options
   * @returns {object} Redacted text and metadata
   */
  redact(text, options = {}) {
    const {
      strategy = "full", // 'full' or 'partial'
    } = options;

    if (!text || typeof text !== "string") {
      return {
        original: text,
        redacted: text,
        redactedCount: 0,
        detected: [],
      };
    }

    // Detect PII
    const piiDetection = this.detector.detectPII(text);

    if (!piiDetection.hasPII) {
      return {
        original: text,
        redacted: text,
        redactedCount: 0,
        detected: [],
        riskLevel: "NONE",
      };
    }

    let redacted = text;
    let totalRedacted = 0;

    // Redact each type of PII
    for (const item of piiDetection.detected) {
      for (const match of item.matches) {
        const replacement =
          strategy === "partial"
            ? this.partialRedact(match, item.type)
            : this.fullRedact(item.type);

        // Use regex with word boundaries for accurate replacement
        const regex = new RegExp(this.escapeRegex(match), "g");
        redacted = redacted.replace(regex, replacement);
        totalRedacted++;

        // Update metrics
        this.metrics.totalRedactions++;
        this.metrics.byType[item.type] =
          (this.metrics.byType[item.type] || 0) + 1;
      }
    }

    return {
      original: text,
      redacted: redacted,
      redactedCount: totalRedacted,
      detected: piiDetection.detected,
      riskLevel: piiDetection.riskLevel,
      riskScore: piiDetection.riskScore,
    };
  }

  /**
   * Full redaction - completely mask the PII
   * @param {string} type - PII type
   * @returns {string} Redaction mask
   */
  fullRedact(type) {
    return this.redactionMasks[type] || "[REDACTED]";
  }

  /**
   * Partial redaction - show last few characters for verification
   * @param {string} value - Value to redact
   * @param {string} type - PII type
   * @returns {string} Partially redacted value
   */
  partialRedact(value, type) {
    if (!value) return "[REDACTED]";

    switch (type) {
      case "phone": {
        // Show last 4 digits: ***-***-1234
        if (value.length >= 10) {
          const cleaned = value.replace(/\D/g, "");
          return `***-***-${cleaned.slice(-4)}`;
        }
        return "[PHONE_REDACTED]";
      }

      case "creditCard": {
        // Show last 4 digits: ****-****-****-1234
        if (value.length >= 4) {
          const cleaned = value.replace(/\D/g, "");
          return `****-****-****-${cleaned.slice(-4)}`;
        }
        return "[CC_REDACTED]";
      }

      case "email": {
        // Show first letter and domain: j***@example.com
        const emailMatch = value.match(/^([a-zA-Z])([^@]+)(@.+)$/);
        if (emailMatch) {
          return `${emailMatch[1]}***${emailMatch[3]}`;
        }
        return "[EMAIL_REDACTED]";
      }

      case "ssn": {
        // Show last 4: ***-**-1234
        const ssnCleaned = value.replace(/\D/g, "");
        if (ssnCleaned.length === 9) {
          return `***-**-${ssnCleaned.slice(-4)}`;
        }
        return "[SSN_REDACTED]";
      }

      case "address":
        // Show street name only: [NUMBER] Main Street
        return value.replace(/^\d+/, "[NUMBER]");

      case "zipCode":
        // Show first 3 digits: 902**
        if (value.length >= 5) {
          return `${value.slice(0, 3)}**`;
        }
        return "[ZIP_REDACTED]";

      default:
        return this.fullRedact(type);
    }
  }

  /**
   * Redact PII with context preservation
   * Useful for debugging - shows what was redacted
   * @param {string} text - Text to redact
   * @returns {object} Redaction result with context
   */
  redactWithContext(text) {
    const result = this.redact(text, { strategy: "full" });

    if (result.redactedCount === 0) {
      return result;
    }

    // Add context annotations
    const annotations = result.detected.map((d) => {
      return `Redacted ${d.count} ${d.description}${d.count > 1 ? "s" : ""}`;
    });

    return {
      ...result,
      context: annotations.join(", "),
      warning:
        result.riskLevel === "HIGH" || result.riskLevel === "CRITICAL"
          ? "High-risk PII detected and redacted"
          : null,
    };
  }

  /**
   * Redact for logging (safe for logs)
   * @param {string} text - Text to redact
   * @returns {string} Safe text for logging
   */
  redactForLogging(text) {
    const result = this.redact(text, { strategy: "full" });
    return result.redacted;
  }

  /**
   * Redact for display (partial redaction for user verification)
   * @param {string} text - Text to redact
   * @returns {string} Partially redacted text
   */
  redactForDisplay(text) {
    const result = this.redact(text, { strategy: "partial" });
    return result.redacted;
  }

  /**
   * Check if text contains high-risk PII
   * @param {string} text - Text to check
   * @returns {boolean} True if high-risk PII found
   */
  containsHighRiskPII(text) {
    const piiDetection = this.detector.detectPII(text);
    return (
      piiDetection.riskLevel === "HIGH" || piiDetection.riskLevel === "CRITICAL"
    );
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Bulk redact multiple texts
   * @param {Array<string>} texts - Array of texts to redact
   * @param {object} options - Redaction options
   * @returns {Array<object>} Array of redaction results
   */
  bulkRedact(texts, options = {}) {
    return texts.map((text) => this.redact(text, options));
  }

  /**
   * Get redaction metrics
   * @returns {object} Metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRedactions: 0,
      byType: {},
    };
  }

  /**
   * Configure custom redaction masks
   * @param {object} masks - Custom masks by type
   */
  setRedactionMasks(masks) {
    this.redactionMasks = {
      ...this.redactionMasks,
      ...masks,
    };
  }
}

// Singleton instance
export const piiRedactor = new PIIRedactor();
