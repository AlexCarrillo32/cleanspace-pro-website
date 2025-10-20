import express from "express";
import { body, validationResult } from "express-validator";
import QuoteAgent from "../services/QuoteAgent.js";
import SessionManager from "../utils/SessionManager.js";
import crypto from "crypto";

const router = express.Router();

// Store active quote sessions with TTL and automatic cleanup
const quoteSessions = new SessionManager({
  ttl: 30 * 60 * 1000, // 30 minutes
  maxSessions: 1000,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
});

function getOrCreateQuoteAgent(sessionId) {
  if (!quoteSessions.has(sessionId)) {
    const agent = new QuoteAgent();
    quoteSessions.set(sessionId, {
      agent,
      conversationHistory: [],
      extractedData: {},
    });
  }
  return quoteSessions.get(sessionId);
}

const chatValidation = [
  body("message").trim().isLength({ min: 1, max: 500 }),
  body("sessionId").optional().isString(),
];

/**
 * POST /api/ai-quote/start
 * Start a new AI quote conversation
 */
router.post("/start", async (req, res, next) => {
  try {
    // Check session capacity
    if (quoteSessions.size() >= 1000) {
      return res.status(503).json({
        success: false,
        message: "Server at capacity. Please try again in a few minutes.",
      });
    }

    const sessionId = crypto.randomUUID();
    getOrCreateQuoteAgent(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        welcomeMessage:
          "Hi! I'm your AI quote assistant. I'll help you get an instant price quote for your cleaning needs. To get started, could you tell me what type of property you need cleaned and approximately how many square feet it is?",
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-quote/chat
 * Continue AI quote conversation
 */
router.post("/chat", chatValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { message, sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required. Call /start first.",
      });
    }

    const session = getOrCreateQuoteAgent(sessionId);

    // Add user message to history
    session.conversationHistory.push({
      role: "user",
      content: message,
    });

    // Get AI response and generate quote if ready
    const response = await session.agent.generateQuote(
      session.conversationHistory,
      message,
    );

    // Add assistant message to history
    session.conversationHistory.push({
      role: "assistant",
      content: response.message,
    });

    // Merge extracted data
    if (response.extractedData) {
      session.extractedData = {
        ...session.extractedData,
        ...response.extractedData,
      };
    }

    res.json({
      success: true,
      data: {
        message: response.message,
        quote: response.quote,
        readyToBook: response.readyToBook,
        needsMoreInfo: response.needsMoreInfo,
        missingFields: response.missingFields,
        extractedData: session.extractedData,
      },
    });
  } catch (error) {
    console.error("AI Quote chat error:", error);
    next(error);
  }
});

/**
 * POST /api/ai-quote/accept
 * Accept quote and create appointment
 */
router.post("/accept", async (req, res, next) => {
  try {
    const { sessionId, customerName, customerPhone, customerEmail } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const session = quoteSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message:
          "Quote session not found or expired. Please start a new quote.",
      });
    }

    // Calculate final quote
    const quote = session.agent.calculateQuote(session.extractedData);

    // Save to database
    const savedQuote = await session.agent.saveQuote(
      {
        extractedData: session.extractedData,
        quote,
      },
      {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
      },
    );

    // Clear session
    quoteSessions.delete(sessionId);

    res.json({
      success: true,
      message:
        "Quote accepted! We'll contact you shortly to confirm your appointment.",
      data: {
        quoteId: savedQuote.quoteId,
        inquiryId: savedQuote.inquiryId,
        total: savedQuote.total,
      },
    });
  } catch (error) {
    console.error("Accept quote error:", error);
    next(error);
  }
});

/**
 * GET /api/ai-quote/session/:sessionId
 * Get current session state
 */
router.get("/session/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = quoteSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    // Calculate current quote if we have enough data
    let currentQuote = null;
    if (session.extractedData.squareFeet) {
      currentQuote = session.agent.calculateQuote(session.extractedData);
    }

    res.json({
      success: true,
      data: {
        extractedData: session.extractedData,
        conversationHistory: session.conversationHistory,
        currentQuote,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
