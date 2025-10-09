/**
 * Unit tests for PIIRedactor
 */

import { PIIRedactor } from "./PIIRedactor.js";

describe("PIIRedactor", () => {
  let redactor;

  beforeEach(() => {
    redactor = new PIIRedactor();
  });

  describe("redact", () => {
    it("redacts email addresses with full strategy", () => {
      const text = "Contact john.doe@example.com for details";
      const result = redactor.redact(text, { strategy: "full" });

      expect(result.redacted).toBe("Contact [EMAIL_REDACTED] for details");
      expect(result.redactedCount).toBe(1);
      expect(result.riskLevel).toBe("MEDIUM");
    });

    it("redacts phone numbers with full strategy", () => {
      const text = "Call me at (555) 123-4567";
      const result = redactor.redact(text);

      expect(result.redacted).toBe("Call me at [PHONE_REDACTED]");
      expect(result.redactedCount).toBe(1);
    });

    it("redacts SSN with full strategy", () => {
      const text = "My SSN is 123-45-6789";
      const result = redactor.redact(text);

      expect(result.redacted).toBe("My SSN is [SSN_REDACTED]");
      expect(result.riskLevel).toBe("HIGH");
    });

    it("redacts credit cards with full strategy", () => {
      const text = "Card: 4111 1111 1111 1111";
      const result = redactor.redact(text);

      expect(result.redacted).toBe("Card: [CC_REDACTED]");
      expect(result.riskLevel).toBe("HIGH");
    });

    it("redacts multiple PII types", () => {
      const text =
        "Email: john@example.com Phone: (555) 123-4567 SSN: 123-45-6789";
      const result = redactor.redact(text);

      expect(result.redacted).toContain("[EMAIL_REDACTED]");
      expect(result.redacted).toContain("[PHONE_REDACTED]");
      expect(result.redacted).toContain("[SSN_REDACTED]");
      expect(result.redactedCount).toBe(3);
      expect(result.riskLevel).toBe("CRITICAL");
    });

    it("returns original text when no PII detected", () => {
      const text = "I need a cleaning service";
      const result = redactor.redact(text);

      expect(result.redacted).toBe(text);
      expect(result.redactedCount).toBe(0);
      expect(result.riskLevel).toBe("NONE");
    });

    it("handles empty and null text", () => {
      expect(redactor.redact("").redacted).toBe("");
      expect(redactor.redact(null).redacted).toBe(null);
      expect(redactor.redact(undefined).redacted).toBe(undefined);
    });
  });

  describe("partialRedact", () => {
    it("shows last 4 digits of phone number", () => {
      const result = redactor.partialRedact("(555) 123-4567", "phone");

      expect(result).toBe("***-***-4567");
    });

    it("shows last 4 digits of credit card", () => {
      const result = redactor.partialRedact(
        "4111 1111 1111 1111",
        "creditCard",
      );

      expect(result).toBe("****-****-****-1111");
    });

    it("shows first letter and domain of email", () => {
      const result = redactor.partialRedact("john.doe@example.com", "email");

      expect(result).toBe("j***@example.com");
    });

    it("shows last 4 digits of SSN", () => {
      const result = redactor.partialRedact("123-45-6789", "ssn");

      expect(result).toBe("***-**-6789");
    });

    it("masks street number in address", () => {
      const result = redactor.partialRedact("123 Main Street", "address");

      expect(result).toBe("[NUMBER] Main Street");
    });

    it("shows first 3 digits of ZIP code", () => {
      const result = redactor.partialRedact("90210", "zipCode");

      expect(result).toBe("902**");
    });
  });

  describe("redact with partial strategy", () => {
    it("uses partial redaction for all PII types", () => {
      const text = "Email: john@example.com Phone: 5551234567";
      const result = redactor.redact(text, { strategy: "partial" });

      expect(result.redacted).toContain("j***@example.com");
      expect(result.redacted).toContain("***-***-4567");
    });
  });

  describe("redactWithContext", () => {
    it("includes context annotations for redacted PII", () => {
      const text = "Contact john@example.com or (555) 123-4567";
      const result = redactor.redactWithContext(text);

      expect(result.context).toContain("Email address");
      expect(result.context).toContain("Phone number");
      expect(result.redacted).not.toContain("john@example.com");
    });

    it("includes warning for high-risk PII", () => {
      const text = "SSN: 123-45-6789";
      const result = redactor.redactWithContext(text);

      expect(result.warning).toBe("High-risk PII detected and redacted");
    });

    it("returns no warning for low-risk PII", () => {
      const text = "Email: john@example.com";
      const result = redactor.redactWithContext(text);

      expect(result.warning).toBeNull();
    });
  });

  describe("redactForLogging", () => {
    it("returns fully redacted text safe for logs", () => {
      const text = "User email: john@example.com, SSN: 123-45-6789";
      const result = redactor.redactForLogging(text);

      expect(result).toBe("User email: [EMAIL_REDACTED], SSN: [SSN_REDACTED]");
    });
  });

  describe("redactForDisplay", () => {
    it("returns partially redacted text for user verification", () => {
      const text = "Phone: (555) 123-4567";
      const result = redactor.redactForDisplay(text);

      expect(result).toBe("Phone: ***-***-4567");
    });
  });

  describe("containsHighRiskPII", () => {
    it("detects high-risk PII (SSN)", () => {
      expect(redactor.containsHighRiskPII("SSN: 123-45-6789")).toBe(true);
    });

    it("detects critical-risk PII (SSN + credit card)", () => {
      expect(
        redactor.containsHighRiskPII("SSN: 123-45-6789, CC: 4111111111111111"),
      ).toBe(true);
    });

    it("returns false for medium-risk PII", () => {
      expect(redactor.containsHighRiskPII("Email: john@example.com")).toBe(
        false,
      );
    });

    it("returns false for no PII", () => {
      expect(redactor.containsHighRiskPII("Clean text")).toBe(false);
    });
  });

  describe("bulkRedact", () => {
    it("redacts multiple texts", () => {
      const texts = [
        "Email: john@example.com",
        "Phone: (555) 123-4567",
        "Clean text",
      ];

      const results = redactor.bulkRedact(texts);

      expect(results).toHaveLength(3);
      expect(results[0].redacted).toBe("Email: [EMAIL_REDACTED]");
      expect(results[1].redacted).toBe("Phone: [PHONE_REDACTED]");
      expect(results[2].redacted).toBe("Clean text");
    });

    it("applies partial strategy to bulk redaction", () => {
      const texts = ["Email: john@example.com"];
      const results = redactor.bulkRedact(texts, { strategy: "partial" });

      expect(results[0].redacted).toBe("Email: j***@example.com");
    });
  });

  describe("metrics", () => {
    it("tracks redaction metrics", () => {
      redactor.redact("Email: john@example.com");
      redactor.redact("Phone: (555) 123-4567");
      redactor.redact("Clean text");

      const metrics = redactor.getMetrics();

      expect(metrics.totalRedactions).toBe(2);
      expect(metrics.byType.email).toBe(1);
      expect(metrics.byType.phone).toBe(1);
    });

    it("resets metrics", () => {
      redactor.redact("Email: john@example.com");
      redactor.resetMetrics();

      const metrics = redactor.getMetrics();

      expect(metrics.totalRedactions).toBe(0);
      expect(metrics.byType).toEqual({});
    });
  });

  describe("setRedactionMasks", () => {
    it("allows custom redaction masks", () => {
      redactor.setRedactionMasks({
        email: "[CUSTOM_EMAIL]",
      });

      const result = redactor.redact("Email: john@example.com");

      expect(result.redacted).toBe("Email: [CUSTOM_EMAIL]");
    });
  });

  describe("escapeRegex", () => {
    it("escapes special regex characters", () => {
      const escaped = redactor.escapeRegex("test (123) [abc]");

      expect(escaped).toBe("test \\(123\\) \\[abc\\]");
    });

    it("handles credit cards with special characters", () => {
      const text = "Card: 4111-1111-1111-1111";
      const result = redactor.redact(text);

      expect(result.redacted).toBe("Card: [CC_REDACTED]");
    });
  });
});
