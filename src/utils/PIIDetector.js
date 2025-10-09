/**
 * PII Detector
 *
 * Detects personally identifiable information in text:
 * - Email addresses
 * - Phone numbers
 * - Social Security Numbers
 * - Credit card numbers
 * - Physical addresses
 * - Names (heuristic-based)
 */

export class PIIDetector {
  constructor() {
    this.patterns = {
      // Email addresses
      email: {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        weight: 5,
        description: "Email address",
      },

      // Phone numbers (US format, various styles)
      phone: {
        pattern:
          /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
        weight: 5,
        description: "Phone number",
      },

      // Social Security Numbers
      ssn: {
        pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        weight: 10,
        description: "Social Security Number",
      },

      // Credit card numbers (basic pattern, 13-19 digits)
      creditCard: {
        pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,7}\b/g,
        weight: 10,
        description: "Credit card number",
      },

      // Street addresses (simple heuristic)
      address: {
        pattern:
          /\b\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|place|pl)\b/gi,
        weight: 3,
        description: "Street address",
      },

      // ZIP codes (US format)
      zipCode: {
        pattern: /\b\d{5}(?:-\d{4})?\b/g,
        weight: 2,
        description: "ZIP code",
      },

      // IP addresses
      ipAddress: {
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        weight: 1,
        description: "IP address",
      },

      // Names (capitalized words, 2+ words, excluding common words)
      potentialName: {
        pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
        weight: 1,
        description: "Potential name",
        filter: (match) => {
          // Exclude common non-name phrases
          const exclude = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
            "United States",
            "New York",
            "Los Angeles",
            "Thank You",
          ];
          return !exclude.includes(match);
        },
      },
    };

    this.metrics = {
      totalChecks: 0,
      piiDetected: 0,
      byType: {},
    };
  }

  /**
   * Detect PII in text
   * @param {string} text - Text to analyze
   * @returns {object} Detection results with risk level
   */
  detectPII(text) {
    this.metrics.totalChecks++;

    if (!text || typeof text !== "string") {
      return {
        hasPII: false,
        detected: [],
        riskLevel: "NONE",
        riskScore: 0,
      };
    }

    const detected = [];

    for (const [type, config] of Object.entries(this.patterns)) {
      const matches = text.match(config.pattern);

      if (matches) {
        // Apply filter if exists
        const filteredMatches = config.filter
          ? matches.filter(config.filter)
          : matches;

        if (filteredMatches.length > 0) {
          detected.push({
            type,
            description: config.description,
            count: filteredMatches.length,
            matches: filteredMatches,
            weight: config.weight,
          });

          // Update metrics
          this.metrics.byType[type] =
            (this.metrics.byType[type] || 0) + filteredMatches.length;
        }
      }
    }

    const hasPII = detected.length > 0;
    if (hasPII) {
      this.metrics.piiDetected++;
    }

    const riskScore = this.calculateRiskScore(detected);
    const riskLevel = this.calculateRiskLevel(riskScore);

    return {
      hasPII,
      detected,
      riskLevel,
      riskScore,
      summary: this.generateSummary(detected),
    };
  }

  /**
   * Calculate risk score based on detected PII
   * @param {Array} detected - Detected PII items
   * @returns {number} Risk score
   */
  calculateRiskScore(detected) {
    let score = 0;

    for (const item of detected) {
      score += item.weight * item.count;
    }

    return score;
  }

  /**
   * Calculate risk level from score
   * @param {number} score - Risk score
   * @returns {string} Risk level (NONE, LOW, MEDIUM, HIGH, CRITICAL)
   */
  calculateRiskLevel(score) {
    if (score === 0) return "NONE";
    if (score >= 20) return "CRITICAL"; // SSN + CC or multiple high-risk items
    if (score >= 10) return "HIGH"; // SSN or CC detected
    if (score >= 5) return "MEDIUM"; // Email or phone detected
    return "LOW"; // Address, ZIP, or name only
  }

  /**
   * Generate human-readable summary
   * @param {Array} detected - Detected PII items
   * @returns {string} Summary text
   */
  generateSummary(detected) {
    if (detected.length === 0) {
      return "No PII detected";
    }

    const types = detected.map((d) => {
      return `${d.count} ${d.description}${d.count > 1 ? "s" : ""}`;
    });

    return `Detected: ${types.join(", ")}`;
  }

  /**
   * Validate credit card using Luhn algorithm
   * @param {string} cardNumber - Card number to validate
   * @returns {boolean} True if valid
   */
  validateCreditCard(cardNumber) {
    // Remove spaces and dashes
    const cleaned = cardNumber.replace(/[\s-]/g, "");

    if (!/^\d{13,19}$/.test(cleaned)) {
      return false;
    }

    // Luhn algorithm
    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate SSN format
   * @param {string} ssn - SSN to validate
   * @returns {boolean} True if valid format
   */
  validateSSN(ssn) {
    // Remove dashes and spaces
    const cleaned = ssn.replace(/[\s-]/g, "");

    // Must be 9 digits
    if (!/^\d{9}$/.test(cleaned)) {
      return false;
    }

    // Cannot be all zeros in any group
    const area = cleaned.substring(0, 3);
    const group = cleaned.substring(3, 5);
    const serial = cleaned.substring(5, 9);

    if (area === "000" || group === "00" || serial === "0000") {
      return false;
    }

    // Area code cannot be 666 or 900-999
    const areaNum = parseInt(area, 10);
    if (areaNum === 666 || areaNum >= 900) {
      return false;
    }

    return true;
  }

  /**
   * Check if detected credit card is valid
   * @param {string} text - Text to check
   * @returns {Array} Valid credit card numbers found
   */
  findValidCreditCards(text) {
    const piiResult = this.detectPII(text);
    const ccDetections = piiResult.detected.filter(
      (d) => d.type === "creditCard",
    );

    if (ccDetections.length === 0) {
      return [];
    }

    const validCards = [];
    for (const detection of ccDetections) {
      for (const match of detection.matches) {
        if (this.validateCreditCard(match)) {
          validCards.push(match);
        }
      }
    }

    return validCards;
  }

  /**
   * Get detection metrics
   * @returns {object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      detectionRate:
        this.metrics.totalChecks > 0
          ? (this.metrics.piiDetected / this.metrics.totalChecks) * 100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalChecks: 0,
      piiDetected: 0,
      byType: {},
    };
  }
}

// Singleton instance
export const piiDetector = new PIIDetector();
