/**
 * AI Content Safety Filter
 *
 * Detects and blocks:
 * - Prompt injection attacks
 * - Jailbreak attempts
 * - Toxic/harmful content
 * - PII exposure attempts
 * - Off-topic requests
 */

export class AIContentSafety {
  constructor() {
    // Prompt injection patterns
    this.promptInjectionPatterns = [
      /ignore\s+(previous|above|all)\s+(instructions|prompts|rules)/gi,
      /forget\s+(everything|all|previous)/gi,
      /you\s+are\s+now\s+\w+/gi,
      /system:\s*/gi,
      /\[INST\]/gi,
      /\[\/INST\]/gi,
      /<\|im_start\|>/gi,
      /<\|im_end\|>/gi,
      /disregard\s+(previous|all)\s+instructions/gi,
      /override\s+your\s+(instructions|programming)/gi,
      /new\s+instructions:/gi,
      /act\s+as\s+(if\s+)?you\s+are/gi,
      /pretend\s+(to\s+be|you\s+are)/gi,
      /simulate\s+(being|a)/gi,
    ];

    // Jailbreak attempt patterns
    this.jailbreakPatterns = [
      /DAN\s+mode/gi,
      /developer\s+mode/gi,
      /evil\s+(mode|bot|AI)/gi,
      /unethical\s+(mode|behavior)/gi,
      /without\s+(ethics|morals|restrictions)/gi,
      /bypass\s+(safety|filters|rules)/gi,
      /unrestricted\s+mode/gi,
      /roleplay\s+as\s+\w+\s+(without|ignoring)/gi,
    ];

    // Toxic content patterns
    this.toxicPatterns = [
      /\b(kill|murder|harm|hurt|attack)\s+(yourself|someone|people)/gi,
      /how\s+to\s+(make|build|create)\s+(bomb|weapon|explosive)/gi,
      /\b(nazi|hitler|holocaust)\s+(was|is)\s+(good|right)/gi,
    ];

    // Off-topic for cleaning service
    this.offTopicPatterns = [
      /write\s+(code|program|script|software)/gi,
      /solve\s+(math|equation|problem)/gi,
      /translate\s+to/gi,
      /what\s+is\s+the\s+(capital|population)/gi,
      /tell\s+me\s+(about|a)\s+(joke|story|poem)/gi,
    ];

    // PII exposure attempts
    this.piiExposurePatterns = [
      /give\s+me\s+(all|someone's)\s+(email|phone|address|ssn|credit card)/gi,
      /list\s+(all|customer|user)\s+(emails|phones|addresses|data)/gi,
      /show\s+me\s+(database|user|customer)\s+records/gi,
    ];

    this.metrics = {
      totalChecks: 0,
      blocked: 0,
      promptInjections: 0,
      jailbreaks: 0,
      toxicContent: 0,
      offTopic: 0,
      piiExposure: 0,
    };
  }

  /**
   * Check if content is safe
   */
  checkSafety(userMessage) {
    this.metrics.totalChecks++;

    const checks = [
      { name: "promptInjection", patterns: this.promptInjectionPatterns },
      { name: "jailbreak", patterns: this.jailbreakPatterns },
      { name: "toxic", patterns: this.toxicPatterns },
      { name: "offTopic", patterns: this.offTopicPatterns },
      { name: "piiExposure", patterns: this.piiExposurePatterns },
    ];

    const violations = [];

    for (const check of checks) {
      for (const pattern of check.patterns) {
        if (pattern.test(userMessage)) {
          violations.push({
            type: check.name,
            pattern: pattern.source,
            match: userMessage.match(pattern)?.[0],
          });

          // Update metrics
          if (check.name === "promptInjection") this.metrics.promptInjections++;
          if (check.name === "jailbreak") this.metrics.jailbreaks++;
          if (check.name === "toxic") this.metrics.toxicContent++;
          if (check.name === "offTopic") this.metrics.offTopic++;
          if (check.name === "piiExposure") this.metrics.piiExposure++;
        }
      }
    }

    if (violations.length > 0) {
      this.metrics.blocked++;
      return {
        safe: false,
        violations,
        blockedReason: this.getBlockedMessage(violations[0].type),
      };
    }

    return { safe: true, violations: [] };
  }

  getBlockedMessage(violationType) {
    const messages = {
      promptInjection:
        "I'm here to help with scheduling cleaning services. Let me know what you need!",
      jailbreak:
        "I can only assist with booking cleaning appointments and estimates. How can I help?",
      toxic:
        "I detected potentially harmful content. Please keep our conversation professional and focused on cleaning services.",
      offTopic:
        "I specialize in scheduling cleaning services. For other requests, you'll need to contact a different service.",
      piiExposure:
        "I cannot provide customer information. I can only help with scheduling your own appointments.",
    };

    return (
      messages[violationType] ||
      "I can only help with scheduling cleaning appointments. What can I assist you with?"
    );
  }

  /**
   * Get safety metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      blockRate:
        this.metrics.totalChecks > 0
          ? (this.metrics.blocked / this.metrics.totalChecks) * 100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalChecks: 0,
      blocked: 0,
      promptInjections: 0,
      jailbreaks: 0,
      toxicContent: 0,
      offTopic: 0,
      piiExposure: 0,
    };
  }

  /**
   * Check response safety (prevent leaking system prompts)
   */
  checkResponseSafety(assistantMessage) {
    const systemPromptLeakPatterns = [
      /system\s+prompt:/gi,
      /my\s+instructions\s+(are|were)/gi,
      /I\s+was\s+(told|instructed)\s+to/gi,
      /according\s+to\s+my\s+(training|instructions)/gi,
    ];

    for (const pattern of systemPromptLeakPatterns) {
      if (pattern.test(assistantMessage)) {
        return {
          safe: false,
          reason: "system_prompt_leak",
          sanitizedMessage:
            "I can help you schedule a cleaning appointment. What information do you need?",
        };
      }
    }

    return { safe: true };
  }
}

// Singleton instance
export const contentSafety = new AIContentSafety();
