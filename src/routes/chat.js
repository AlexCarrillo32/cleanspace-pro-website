import express from "express";
import { body, validationResult } from "express-validator";
import { SchedulingAgent } from "../services/SchedulingAgent.js";
import crypto from "crypto";

const router = express.Router();

// Store active agents by session
const activeSessions = new Map();

function getOrCreateAgent(sessionId, variant = "baseline") {
  if (!activeSessions.has(sessionId)) {
    const agent = new SchedulingAgent(variant);
    activeSessions.set(sessionId, agent);
  }
  return activeSessions.get(sessionId);
}

const chatValidation = [
  body("message").trim().isLength({ min: 1, max: 1000 }),
  body("sessionId").optional().isString(),
  body("variant").optional().isIn(["baseline", "professional", "casual"]),
];

router.post("/start", async (req, res, next) => {
  try {
    const { variant = "baseline" } = req.body;
    const sessionId = crypto.randomUUID();

    const agent = getOrCreateAgent(sessionId, variant);
    const conversation = await agent.startConversation(sessionId);

    res.json({
      success: true,
      data: {
        sessionId: conversation.sessionId,
        conversationId: conversation.conversationId,
        variant,
        welcomeMessage:
          "Hi! I'm here to help you schedule a cleaning service or free estimate. What can I help you with today?",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/message", chatValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { message, sessionId, variant = "baseline" } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required. Call /start first.",
      });
    }

    const agent = getOrCreateAgent(sessionId, variant);

    // Get conversation ID from session
    const conversationId = parseInt(sessionId.split("-")[0]) || 1;

    const response = await agent.chat(conversationId, message);

    res.json({
      success: true,
      data: {
        message: response.message,
        action: response.action,
        extractedData: response.extractedData,
        metadata: response.metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/book", async (req, res, next) => {
  try {
    const { sessionId, appointmentData } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const agent = getOrCreateAgent(sessionId);
    const conversationId = parseInt(sessionId.split("-")[0]) || 1;

    // Check availability
    const availability = await agent.checkAvailability(
      appointmentData.date,
      appointmentData.time,
    );

    if (!availability.available) {
      return res.status(409).json({
        success: false,
        message:
          "This time slot is already booked. Please choose another time.",
      });
    }

    // Book appointment
    const appointment = await agent.bookAppointment(
      appointmentData,
      conversationId,
    );

    res.json({
      success: true,
      message: "Appointment scheduled successfully!",
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/end", async (req, res, next) => {
  try {
    const { sessionId, satisfaction } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const agent = getOrCreateAgent(sessionId);
    const conversationId = parseInt(sessionId.split("-")[0]) || 1;

    await agent.endConversation(conversationId, true, satisfaction);

    // Clean up session
    activeSessions.delete(sessionId);

    res.json({
      success: true,
      message: "Thank you for using our scheduling service!",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/history/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const agent = activeSessions.get(sessionId);
    const conversationId = parseInt(sessionId.split("-")[0]) || 1;

    const history = await agent.getConversationHistory(conversationId);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
