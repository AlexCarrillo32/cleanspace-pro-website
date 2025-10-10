/**
 * Unit tests for PIIDetector
 */

import { PIIDetector } from "./PIIDetector.js";

describe("PIIDetector", () => {
  let detector;

  beforeEach(() => {
    detector = new PIIDetector();
  });

  describe("detectPII", () => {
    it("detects email addresses", () => {
      const result = detector.detectPII("My email is john.doe@example.com");

      expect(result.hasPII).toBe(true);
      expect(result.detected).toHaveLength(1);
      expect(result.detected[0].type).toBe("email");
      expect(result.detected[0].matches[0]).toBe("john.doe@example.com");
      expect(result.riskLevel).toBe("MEDIUM");
    });

    it("detects phone numbers in various formats", () => {
      const texts = [
        "(555) 123-4567",
        "555-123-4567",
        "555.123.4567",
        "5551234567",
      ];

      texts.forEach((text) => {
        const result = detector.detectPII(`Call me at ${text}`);
        expect(result.hasPII).toBe(true);
        expect(result.detected[0].type).toBe("phone");
      });
    });

    it("detects Social Security Numbers", () => {
      const result = detector.detectPII("My SSN is 123-45-6789");

      expect(result.hasPII).toBe(true);
      expect(result.detected[0].type).toBe("ssn");
      expect(result.riskLevel).toBe("HIGH");
    });

    it("detects credit card numbers", () => {
      const result = detector.detectPII("My card is 4111 1111 1111 1111");

      expect(result.hasPII).toBe(true);
      expect(result.detected[0].type).toBe("creditCard");
      expect(result.riskLevel).toBe("HIGH");
    });

    it("detects street addresses", () => {
      const result = detector.detectPII("I live at 123 Main Street");

      expect(result.hasPII).toBe(true);
      expect(result.detected[0].type).toBe("address");
    });

    it("detects ZIP codes", () => {
      const result = detector.detectPII("ZIP: 90210");

      expect(result.hasPII).toBe(true);
      expect(result.detected[0].type).toBe("zipCode");
    });

    it("detects multiple PII types", () => {
      const result = detector.detectPII(
        "Contact John Smith at john@example.com or (555) 123-4567",
      );

      expect(result.hasPII).toBe(true);
      expect(result.detected.length).toBeGreaterThanOrEqual(2);
    });

    it("returns no PII for clean text", () => {
      const result = detector.detectPII(
        "I need a cleaning service for my home",
      );

      expect(result.hasPII).toBe(false);
      expect(result.detected).toHaveLength(0);
      expect(result.riskLevel).toBe("NONE");
    });

    it("handles empty or null text", () => {
      expect(detector.detectPII("").hasPII).toBe(false);
      expect(detector.detectPII(null).hasPII).toBe(false);
      expect(detector.detectPII(undefined).hasPII).toBe(false);
    });
  });

  describe("calculateRiskLevel", () => {
    it("assigns CRITICAL risk for SSN + credit card", () => {
      const result = detector.detectPII(
        "SSN: 123-45-6789, CC: 4111 1111 1111 1111",
      );

      expect(result.riskLevel).toBe("CRITICAL");
      expect(result.riskScore).toBeGreaterThanOrEqual(20);
    });

    it("assigns HIGH risk for SSN alone", () => {
      const result = detector.detectPII("SSN: 123-45-6789");

      expect(result.riskLevel).toBe("HIGH");
    });

    it("assigns MEDIUM risk for email or phone", () => {
      const result = detector.detectPII("Email: john@example.com");

      expect(result.riskLevel).toBe("MEDIUM");
    });

    it("assigns LOW risk for address only", () => {
      const result = detector.detectPII("123 Main Street");

      expect(result.riskLevel).toBe("LOW");
    });
  });

  describe("validateCreditCard", () => {
    it("validates valid credit card numbers using Luhn algorithm", () => {
      expect(detector.validateCreditCard("4111111111111111")).toBe(true);
      expect(detector.validateCreditCard("5500000000000004")).toBe(true);
    });

    it("rejects invalid credit card numbers", () => {
      expect(detector.validateCreditCard("4111111111111112")).toBe(false);
      expect(detector.validateCreditCard("1234567890123456")).toBe(false);
    });

    it("handles credit cards with spaces and dashes", () => {
      expect(detector.validateCreditCard("4111-1111-1111-1111")).toBe(true);
      expect(detector.validateCreditCard("4111 1111 1111 1111")).toBe(true);
    });
  });

  describe("validateSSN", () => {
    it("validates valid SSN format", () => {
      expect(detector.validateSSN("123-45-6789")).toBe(true);
      expect(detector.validateSSN("123456789")).toBe(true);
    });

    it("rejects invalid SSN formats", () => {
      expect(detector.validateSSN("000-45-6789")).toBe(false); // Area 000
      expect(detector.validateSSN("123-00-6789")).toBe(false); // Group 00
      expect(detector.validateSSN("123-45-0000")).toBe(false); // Serial 0000
      expect(detector.validateSSN("666-45-6789")).toBe(false); // Area 666
      expect(detector.validateSSN("900-45-6789")).toBe(false); // Area 900+
    });
  });

  describe("metrics", () => {
    it("tracks detection metrics", () => {
      detector.detectPII("Clean text");
      detector.detectPII("Email: john@example.com");
      detector.detectPII("Phone: (555) 123-4567");

      const metrics = detector.getMetrics();

      expect(metrics.totalChecks).toBe(3);
      expect(metrics.piiDetected).toBe(2);
      expect(metrics.detectionRate).toBeCloseTo(66.67, 1);
    });

    it("resets metrics", () => {
      detector.detectPII("Email: john@example.com");
      detector.resetMetrics();

      const metrics = detector.getMetrics();

      expect(metrics.totalChecks).toBe(0);
      expect(metrics.piiDetected).toBe(0);
    });
  });
});
