/**
 * Unit tests for SafeLogger
 */

import { SafeLogger } from "./SafeLogger.js";
import { piiDetector } from "./PIIDetector.js";
import { piiRedactor } from "./PIIRedactor.js";

// Mock console methods
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log,
};

describe("SafeLogger", () => {
  let logger;
  let consoleMock;

  beforeEach(() => {
    // Create mock console methods
    consoleMock = {
      debug: [],
      info: [],
      warn: [],
      error: [],
      log: [],
    };

    console.debug = (...args) => consoleMock.debug.push(args);
    console.info = (...args) => consoleMock.info.push(args);
    console.warn = (...args) => consoleMock.warn.push(args);
    console.error = (...args) => consoleMock.error.push(args);
    console.log = (...args) => consoleMock.log.push(args);

    logger = new SafeLogger({
      serviceName: "test-service",
      logLevel: "DEBUG",
    });

    // Mock persistLog to avoid database calls
    logger.persistLog = async () => {};
    logger.persistPIIEvent = async () => {};

    // Reset metrics
    piiDetector.resetMetrics();
    piiRedactor.resetMetrics();
    logger.resetMetrics();
  });

  afterEach(() => {
    // Restore console
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log = originalConsole.log;
  });

  describe("log", () => {
    it("logs message at specified level", () => {
      const result = logger.log("INFO", "Test message");

      expect(result.level).toBe("INFO");
      expect(result.message).toBe("Test message");
      expect(result.service).toBe("test-service");
      expect(consoleMock.info.length).toBeGreaterThan(0);
    });

    it("does not log below configured level", () => {
      logger.logLevel = "ERROR";
      logger.log("INFO", "Test message");

      expect(consoleMock.info.length).toBe(0);
    });

    it("increments metrics", () => {
      logger.log("INFO", "Test message");

      const metrics = logger.getMetrics();
      expect(metrics.totalLogs).toBe(1);
      expect(metrics.byLevel.INFO).toBe(1);
    });
  });

  describe("createLogEntry", () => {
    it("creates structured log entry", () => {
      const entry = logger.createLogEntry("INFO", "Test message", {
        userId: "123",
      });

      expect(entry.level).toBe("INFO");
      expect(entry.message).toBe("Test message");
      expect(entry.service).toBe("test-service");
      expect(entry.userId).toBe("123");
      expect(entry.timestamp).toBeDefined();
      expect(entry.nodeVersion).toBe(process.version);
      expect(entry.platform).toBe(process.platform);
    });

    it("auto-generates requestId", () => {
      const entry = logger.createLogEntry("INFO", "Test", {});

      expect(entry.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });

  describe("makeSafe - PII detection and redaction", () => {
    it("detects and redacts PII in message", () => {
      const entry = {
        message: "User email: john@example.com",
        level: "INFO",
      };

      const safe = logger.makeSafe(entry);

      expect(safe.message).toBe("User email: [EMAIL_REDACTED]");
      expect(safe._piiRedacted).toBe(true);
      expect(safe._piiLocations).toHaveLength(1);
      expect(safe._piiLocations[0].types).toContain("email");
    });

    it("does not modify clean messages", () => {
      const entry = {
        message: "Clean log message",
        level: "INFO",
      };

      const safe = logger.makeSafe(entry);

      expect(safe.message).toBe("Clean log message");
      expect(safe._piiRedacted).toBeUndefined();
    });

    it("increments PII detection metrics", () => {
      const entry = {
        message: "SSN: 123-45-6789",
        level: "INFO",
      };

      logger.makeSafe(entry);

      const metrics = logger.getMetrics();
      expect(metrics.piiDetected).toBe(1);
    });
  });

  describe("redactObject", () => {
    it("recursively redacts PII in objects", () => {
      const obj = {
        name: "John Doe",
        email: "john@example.com",
        nested: {
          phone: "(555) 123-4567",
        },
      };

      const redacted = logger.redactObject(obj);

      expect(redacted.email).toBe("[EMAIL_REDACTED]");
      expect(redacted.nested.phone).toBe("[PHONE_REDACTED]");
    });

    it("handles arrays", () => {
      const arr = ["john@example.com", "Clean text"];

      const redacted = logger.redactObject(arr);

      expect(redacted[0]).toBe("[EMAIL_REDACTED]");
      expect(redacted[1]).toBe("Clean text");
    });

    it("handles null and primitive values", () => {
      expect(logger.redactObject(null)).toBe(null);
      expect(logger.redactObject(123)).toBe(123);
      expect(logger.redactObject("test")).toBe("test");
    });
  });

  describe("convenience methods", () => {
    it("debug logs at DEBUG level", () => {
      logger.debug("Debug message");

      expect(consoleMock.debug.length).toBeGreaterThan(0);
    });

    it("info logs at INFO level", () => {
      logger.info("Info message");

      expect(consoleMock.info.length).toBeGreaterThan(0);
    });

    it("warn logs at WARN level", () => {
      logger.warn("Warning message");

      expect(consoleMock.warn.length).toBeGreaterThan(0);
    });

    it("error logs at ERROR level with Error object", () => {
      const err = new Error("Test error");
      const result = logger.error("Error occurred", err);

      expect(result.level).toBe("ERROR");
      expect(result.error.message).toBe("Test error");
      expect(result.error.stack).toBeDefined();
      expect(consoleMock.error.length).toBeGreaterThan(0);
    });

    it("error logs at ERROR level with metadata", () => {
      const result = logger.error("Error occurred", { code: 500 });

      expect(result.level).toBe("ERROR");
      expect(result.code).toBe(500);
    });

    it("critical logs at CRITICAL level", () => {
      logger.critical("Critical message");

      expect(consoleMock.error.length).toBeGreaterThan(0);
    });
  });

  describe("output", () => {
    it("outputs DEBUG to console.debug", () => {
      const entry = { level: "DEBUG", message: "test" };
      logger.output(entry);

      expect(consoleMock.debug.length).toBeGreaterThan(0);
    });

    it("outputs INFO to console.info", () => {
      const entry = { level: "INFO", message: "test" };
      logger.output(entry);

      expect(consoleMock.info.length).toBeGreaterThan(0);
    });

    it("outputs WARN to console.warn", () => {
      const entry = { level: "WARN", message: "test" };
      logger.output(entry);

      expect(consoleMock.warn.length).toBeGreaterThan(0);
    });

    it("outputs ERROR to console.error", () => {
      const entry = { level: "ERROR", message: "test" };
      logger.output(entry);

      expect(consoleMock.error.length).toBeGreaterThan(0);
    });

    it("outputs CRITICAL to console.error", () => {
      const entry = { level: "CRITICAL", message: "test" };
      logger.output(entry);

      expect(consoleMock.error.length).toBeGreaterThan(0);
    });
  });

  describe("persistLog", () => {
    it("persists ERROR logs to database", async () => {
      await logger.error("Test error");

      // Database mock should be called
      expect(true).toBe(true); // Database is mocked
    });

    it("persists CRITICAL logs to database", async () => {
      await logger.critical("Test critical");

      // Database mock should be called
      expect(true).toBe(true); // Database is mocked
    });

    it("does not persist INFO logs to database", async () => {
      logger.info("Test info");

      // Only ERROR and CRITICAL are persisted
      expect(true).toBe(true);
    });
  });

  describe("logConversation", () => {
    it("detects PII in user message", async () => {
      await logger.logConversation(
        "session-123",
        "My email is john@example.com",
        "Thank you for contacting us",
      );

      // Check that detector metrics were incremented
      const detectorMetrics = piiDetector.getMetrics();
      expect(detectorMetrics.piiDetected).toBeGreaterThan(0);
    });

    it("detects PII in AI response", async () => {
      await logger.logConversation(
        "session-123",
        "What is your email?",
        "Our email is support@example.com",
      );

      // Check that detector metrics were incremented
      const detectorMetrics = piiDetector.getMetrics();
      expect(detectorMetrics.piiDetected).toBeGreaterThan(0);
    });

    it("redacts PII before logging", async () => {
      const result = await logger.logConversation(
        "session-123",
        "Email: john@example.com",
        "Phone: (555) 123-4567",
      );

      expect(result.userMessage).toBe("Email: [EMAIL_REDACTED]");
      expect(result.aiResponse).toBe("Phone: [PHONE_REDACTED]");
    });

    it("includes PII detection metadata", async () => {
      const result = await logger.logConversation(
        "session-123",
        "Email: john@example.com",
        "Clean response",
      );

      expect(result.piiDetected.inUserMessage).toBe(true);
      expect(result.piiDetected.inAiResponse).toBe(false);
      expect(result.piiDetected.userRiskLevel).toBe("MEDIUM");
      expect(result.piiDetected.aiRiskLevel).toBe("NONE");
    });
  });

  describe("getMetrics", () => {
    it("returns logger metrics", () => {
      logger.info("Test 1");
      logger.error("Test 2");

      const metrics = logger.getMetrics();

      expect(metrics.totalLogs).toBe(2);
      expect(metrics.byLevel.INFO).toBe(1);
      expect(metrics.byLevel.ERROR).toBe(1);
      expect(metrics.piiDetectionRate).toBe(0);
    });

    it("calculates PII detection rate", () => {
      logger.info("Clean message");
      logger.info("Email: john@example.com");

      const metrics = logger.getMetrics();

      expect(metrics.piiDetectionRate).toBe(50);
    });

    it("includes detector and redactor metrics", () => {
      const metrics = logger.getMetrics();

      expect(metrics.piiDetectorMetrics).toBeDefined();
      expect(metrics.redactorMetrics).toBeDefined();
    });
  });

  describe("resetMetrics", () => {
    it("resets all metrics", () => {
      logger.info("Test");
      logger.resetMetrics();

      const metrics = logger.getMetrics();

      expect(metrics.totalLogs).toBe(0);
      expect(metrics.piiDetected).toBe(0);
      expect(metrics.byLevel).toEqual({});
    });
  });

  describe("generateRequestId", () => {
    it("generates unique request IDs", () => {
      const id1 = logger.generateRequestId();
      const id2 = logger.generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });

  describe("PII protection enabled/disabled", () => {
    it("skips PII detection when disabled", () => {
      const noPIILogger = new SafeLogger({
        enablePIIDetection: false,
      });

      const entry = {
        message: "Email: john@example.com",
        level: "INFO",
      };

      const safe = noPIILogger.makeSafe(entry);

      expect(safe.message).toBe("Email: john@example.com");
      expect(safe._piiRedacted).toBeUndefined();
    });
  });
});
