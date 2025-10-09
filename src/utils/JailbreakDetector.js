/**
 * Advanced Jailbreak Detection
 *
 * Detects attempts to bypass AI safety systems with:
 * - Leetspeak normalization (D4N → DAN)
 * - Base64 and encoding detection
 * - Multi-message attack tracking
 * - Pattern evolution detection
 */

export class JailbreakDetector {
  constructor() {
    // Known jailbreak patterns (from existing AIContentSafety.js)
    this.patterns = [
      /ignore\s+(previous|above|all)\s+(instructions|commands|rules)/gi,
      /you\s+are\s+(no\s+longer|not)\s+an?\s+AI/gi,
      /pretend\s+(you|to)\s+(are|be)/gi,
      /roleplay\s+as/gi,
      /DAN\s+mode/gi,
      /developer\s+mode/gi,
      /jailbreak/gi,
      /unrestricted\s+mode/gi,
      /act\s+as\s+if/gi,
      /bypass\s+(your|the)\s+(programming|constraints|limitations)/gi,
      /forget\s+(your|all)\s+(rules|instructions|guidelines)/gi,
      /evil\s+confidant/gi,
    ];

    // Leetspeak character mappings
    this.leetspeakMap = {
      4: "a",
      "@": "a",
      8: "b",
      3: "e",
      1: "i",
      "!": "i",
      0: "o",
      5: "s",
      $: "s",
      7: "t",
      "+": "t",
      9: "g",
      6: "g",
    };

    // Multi-message tracking
    this.sessionHistory = new Map(); // sessionId -> messages[]
    this.sessionMaxMessages = 10;
    this.sessionTTL = 3600000; // 1 hour

    // Metrics
    this.metrics = {
      totalChecks: 0,
      jailbreaksDetected: 0,
      byType: {
        pattern: 0,
        leetspeak: 0,
        encoded: 0,
        multiMessage: 0,
      },
      bySeverity: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    };
  }

  /**
   * Detect jailbreak attempts in user message
   * @param {string} message - User message
   * @param {string} sessionId - Session ID for multi-message tracking
   * @returns {object} Detection result
   */
  detect(message, sessionId = null) {
    this.metrics.totalChecks++;

    if (!message || typeof message !== "string") {
      return {
        isJailbreak: false,
        detected: [],
        severity: "NONE",
        normalizedMessage: message,
      };
    }

    const detected = [];
    let severity = "NONE";

    // 1. Normalize message (handle leetspeak)
    const normalized = this.normalizeText(message);

    // 2. Check for direct pattern matches
    const patternMatches = this.checkPatterns(normalized);
    if (patternMatches.length > 0) {
      detected.push(...patternMatches);
      severity = this.escalateSeverity(severity, "HIGH");
      this.metrics.byType.pattern++;
    }

    // 3. Check for leetspeak obfuscation
    if (normalized !== message.toLowerCase()) {
      const leetspeakResult = this.checkLeetspeak(message, normalized);
      if (leetspeakResult.detected) {
        detected.push(leetspeakResult);
        severity = this.escalateSeverity(severity, "MEDIUM");
        this.metrics.byType.leetspeak++;
      }
    }

    // 4. Check for encoded content
    const encodedResult = this.checkEncoding(message);
    if (encodedResult.detected) {
      detected.push(encodedResult);
      severity = this.escalateSeverity(severity, "HIGH");
      this.metrics.byType.encoded++;
    }

    // 5. Multi-message attack detection
    if (sessionId) {
      const multiMessageResult = this.checkMultiMessage(
        message,
        sessionId,
        detected.length > 0,
      );
      if (multiMessageResult.detected) {
        detected.push(multiMessageResult);
        severity = this.escalateSeverity(severity, "CRITICAL");
        this.metrics.byType.multiMessage++;
      }
    }

    const isJailbreak = detected.length > 0;
    if (isJailbreak) {
      this.metrics.jailbreaksDetected++;
      this.metrics.bySeverity[severity]++;
    }

    return {
      isJailbreak,
      detected,
      severity,
      normalizedMessage: normalized,
      confidence: this.calculateConfidence(detected),
      recommendations: this.getRecommendations(detected, severity),
    };
  }

  /**
   * Normalize text to handle leetspeak
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    let normalized = text.toLowerCase();

    // Replace leetspeak characters
    for (const [leet, normal] of Object.entries(this.leetspeakMap)) {
      const regex = new RegExp(this.escapeRegex(leet), "gi");
      normalized = normalized.replace(regex, normal);
    }

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
  }

  /**
   * Check for pattern matches
   * @param {string} normalized - Normalized message
   * @returns {Array} Detected patterns
   */
  checkPatterns(normalized) {
    const matches = [];

    for (const pattern of this.patterns) {
      const match = normalized.match(pattern);
      if (match) {
        matches.push({
          type: "pattern",
          pattern: pattern.source,
          match: match[0],
          description: "Direct jailbreak pattern detected",
        });
      }
    }

    return matches;
  }

  /**
   * Check for leetspeak obfuscation
   * @param {string} original - Original message
   * @param {string} normalized - Normalized message
   * @returns {object} Leetspeak detection result
   */
  checkLeetspeak(original, normalized) {
    // Count leetspeak characters
    let leetspeakCount = 0;
    for (const leet of Object.keys(this.leetspeakMap)) {
      const regex = new RegExp(this.escapeRegex(leet), "g");
      const matches = original.match(regex);
      if (matches) {
        leetspeakCount += matches.length;
      }
    }

    // If significant leetspeak and matches jailbreak patterns
    if (leetspeakCount >= 3) {
      for (const pattern of this.patterns) {
        if (pattern.test(normalized)) {
          return {
            detected: true,
            type: "leetspeak",
            count: leetspeakCount,
            description: `Leetspeak obfuscation detected (${leetspeakCount} characters)`,
            original: original,
            normalized: normalized,
          };
        }
      }
    }

    return { detected: false };
  }

  /**
   * Check for encoded content (base64, hex, etc.)
   * @param {string} message - Message to check
   * @returns {object} Encoding detection result
   */
  checkEncoding(message) {
    // Check for base64 (at least 20 chars, valid base64 pattern)
    const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    const base64Matches = message.match(base64Pattern);

    if (base64Matches) {
      for (const encoded of base64Matches) {
        try {
          const decoded = Buffer.from(encoded, "base64").toString("utf-8");

          // Check if decoded content contains jailbreak patterns
          const normalized = this.normalizeText(decoded);
          for (const pattern of this.patterns) {
            if (pattern.test(normalized)) {
              return {
                detected: true,
                type: "base64",
                encoded: encoded.substring(0, 30) + "...",
                decoded: decoded.substring(0, 100),
                description: "Base64-encoded jailbreak attempt detected",
              };
            }
          }
        } catch {
          // Invalid base64, continue
        }
      }
    }

    // Check for hex encoding
    const hexPattern = /(?:0x|\\x)?[0-9a-fA-F]{40,}/g;
    const hexMatches = message.match(hexPattern);

    if (hexMatches) {
      for (const encoded of hexMatches) {
        try {
          const cleaned = encoded.replace(/(?:0x|\\x)/g, "");
          const decoded = Buffer.from(cleaned, "hex").toString("utf-8");

          const normalized = this.normalizeText(decoded);
          for (const pattern of this.patterns) {
            if (pattern.test(normalized)) {
              return {
                detected: true,
                type: "hex",
                encoded: encoded.substring(0, 30) + "...",
                decoded: decoded.substring(0, 100),
                description: "Hex-encoded jailbreak attempt detected",
              };
            }
          }
        } catch {
          // Invalid hex, continue
        }
      }
    }

    return { detected: false };
  }

  /**
   * Check for multi-message attack patterns
   * @param {string} message - Current message
   * @param {string} sessionId - Session ID
   * @param {boolean} currentDetected - Whether current message was detected
   * @returns {object} Multi-message detection result
   */
  checkMultiMessage(message, sessionId, currentDetected) {
    // Update session history
    if (!this.sessionHistory.has(sessionId)) {
      this.sessionHistory.set(sessionId, {
        messages: [],
        timestamp: Date.now(),
        suspicionScore: 0,
      });
    }

    const session = this.sessionHistory.get(sessionId);

    // Clean old sessions
    this.cleanOldSessions();

    // Add current message
    session.messages.push({
      text: message,
      detected: currentDetected,
      timestamp: Date.now(),
    });

    // Keep only recent messages
    if (session.messages.length > this.sessionMaxMessages) {
      session.messages.shift();
    }

    // Calculate suspicion score
    const recentDetections = session.messages
      .slice(-5)
      .filter((m) => m.detected).length;

    // Check for gradual escalation pattern
    const gradualEscalation = this.detectGradualEscalation(session.messages);

    if (recentDetections >= 2 || gradualEscalation) {
      return {
        detected: true,
        type: "multi-message",
        recentDetections,
        totalMessages: session.messages.length,
        description: gradualEscalation
          ? "Gradual escalation attack pattern detected"
          : `Multiple jailbreak attempts (${recentDetections} in last 5 messages)`,
      };
    }

    return { detected: false };
  }

  /**
   * Detect gradual escalation patterns
   * @param {Array} messages - Message history
   * @returns {boolean} Whether escalation detected
   */
  detectGradualEscalation(messages) {
    if (messages.length < 3) return false;

    // Look for increasing sophistication
    const keywords = [
      "hypothetical",
      "scenario",
      "imagine",
      "pretend",
      "roleplay",
      "fiction",
      "story",
    ];

    let keywordCount = 0;
    for (const msg of messages.slice(-5)) {
      const normalized = this.normalizeText(msg.text);
      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          keywordCount++;
          break;
        }
      }
    }

    return keywordCount >= 3;
  }

  /**
   * Clean old sessions
   */
  cleanOldSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessionHistory.entries()) {
      if (now - session.timestamp > this.sessionTTL) {
        this.sessionHistory.delete(sessionId);
      }
    }
  }

  /**
   * Escalate severity level
   * @param {string} current - Current severity
   * @param {string} detected - Detected severity
   * @returns {string} Escalated severity
   */
  escalateSeverity(current, detected) {
    const levels = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const currentIdx = levels.indexOf(current);
    const detectedIdx = levels.indexOf(detected);
    return levels[Math.max(currentIdx, detectedIdx)];
  }

  /**
   * Calculate confidence score
   * @param {Array} detected - Detected items
   * @returns {number} Confidence (0-100)
   */
  calculateConfidence(detected) {
    if (detected.length === 0) return 0;

    let confidence = 0;

    for (const item of detected) {
      switch (item.type) {
        case "pattern":
          confidence += 40;
          break;
        case "leetspeak":
          confidence += 25;
          break;
        case "base64":
        case "hex":
          confidence += 35;
          break;
        case "multi-message":
          confidence += 30;
          break;
      }
    }

    return Math.min(confidence, 100);
  }

  /**
   * Get recommendations based on detection
   * @param {Array} detected - Detected items
   * @param {string} severity - Severity level
   * @returns {Array} Recommendations
   */
  getRecommendations(detected, severity) {
    const recommendations = [];

    if (severity === "CRITICAL") {
      recommendations.push("Block user immediately");
      recommendations.push("Alert security team");
      recommendations.push("Review session history");
    } else if (severity === "HIGH") {
      recommendations.push("Block current message");
      recommendations.push("Monitor session closely");
      recommendations.push("Log for security review");
    } else if (severity === "MEDIUM") {
      recommendations.push("Warn user about policy");
      recommendations.push("Increase monitoring");
    }

    if (detected.some((d) => d.type === "multi-message")) {
      recommendations.push("Consider temporary session suspension");
    }

    return recommendations;
  }

  /**
   * Escape regex special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get metrics
   * @returns {object} Detection metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      detectionRate:
        this.metrics.totalChecks > 0
          ? (this.metrics.jailbreaksDetected / this.metrics.totalChecks) * 100
          : 0,
      activeSessions: this.sessionHistory.size,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalChecks: 0,
      jailbreaksDetected: 0,
      byType: {
        pattern: 0,
        leetspeak: 0,
        encoded: 0,
        multiMessage: 0,
      },
      bySeverity: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    };
  }
}

// Singleton instance
export const jailbreakDetector = new JailbreakDetector();
