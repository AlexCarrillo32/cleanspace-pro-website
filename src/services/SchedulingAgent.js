import Groq from "groq-sdk";
import { getDatabase } from "../database/init.js";
import { contentSafety } from "../utils/AIContentSafety.js";
import { CircuitBreaker } from "../utils/CircuitBreaker.js";
import { RetryPolicies } from "../utils/RetryPolicies.js";

const GROQ_MODELS = {
  fast: "llama-3.1-8b-instant", // Free, very fast
  balanced: "llama-3.1-70b-versatile", // Free, more capable
};

const PRICING = {
  "llama-3.1-8b-instant": { input: 0.05 / 1000000, output: 0.08 / 1000000 },
  "llama-3.1-70b-versatile": { input: 0.59 / 1000000, output: 0.79 / 1000000 },
};

const VARIANTS = {
  baseline: {
    model: GROQ_MODELS.fast,
    temperature: 0.7,
    systemPrompt: `You are a friendly scheduling assistant for CleanSpace Pro, a professional cleaning service.

Your job is to:
1. Greet customers warmly
2. Collect necessary information: name, phone, email, service type, property details
3. Check available appointment slots
4. Schedule appointments for estimates or cleaning services
5. Confirm all details with the customer

Business hours:
- Monday-Friday: 9:00 AM - 5:00 PM
- Saturday: 10:00 AM - 3:00 PM
- Sunday: Closed

Service types:
- Residential Cleaning (standard, deep clean, move-in/out)
- Commercial Cleaning (offices, retail spaces)
- Specialized Services (carpet cleaning, window washing)

Appointment types:
- Free Estimate (30-60 minutes, on-site visit)
- Standard Cleaning (2-4 hours depending on size)
- Deep Cleaning (4-8 hours depending on size)

Always be professional, friendly, and efficient. If you don't have information, ask specific questions. Confirm the appointment details before finalizing.

Respond in JSON format with: { "message": "your response", "action": "collect_info|check_availability|book_appointment|confirm", "extracted_data": {...} }`,
  },
  professional: {
    model: GROQ_MODELS.balanced,
    temperature: 0.5,
    systemPrompt: `You are a professional scheduling coordinator for CleanSpace Pro.

Your primary objectives:
1. Efficiently gather customer information
2. Qualify leads by understanding their needs
3. Optimize scheduling to maximize bookings
4. Provide clear, concise communication

Business parameters:
- Operating Hours: Mon-Fri 9AM-5PM, Sat 10AM-3PM
- Service Categories: Residential, Commercial, Specialized
- Appointment Duration: Estimates (30-60min), Cleanings (2-8hrs)

Communication style: Professional, efficient, solution-oriented.

Output format: JSON with structure { "message": string, "action": string, "extracted_data": object }`,
  },
  casual: {
    model: GROQ_MODELS.fast,
    temperature: 0.9,
    systemPrompt: `Hey! You're the friendly booking assistant for CleanSpace Pro! 🧹✨

Your vibe: Helpful, upbeat, and super easy to talk to!

What you do:
- Chat with customers about their cleaning needs
- Get their info (name, phone, when they want us to come by)
- Book them in for a free estimate or cleaning
- Make sure they're excited about getting their space sparkling clean!

We're open:
- Weekdays 9-5
- Saturdays 10-3
- Sundays we're catching up on our own cleaning! 😄

Services we rock at:
- Home cleaning (regular or deep clean)
- Office/business spaces
- Special stuff like carpets and windows

Keep it fun and friendly! When you have all the details, book 'em in!

Reply in JSON: { "message": "your friendly message", "action": "what_to_do_next", "extracted_data": {...} }`,
  },
};

export class SchedulingAgent {
  constructor(variant = "baseline") {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not found in environment variables");
    }

    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    this.variant = VARIANTS[variant] || VARIANTS.baseline;
    this.variantName = variant;

    // Safety systems
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000,
    });
    this.retryPolicy = RetryPolicies.standard;
  }

  async startConversation(sessionId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO conversations (session_id, variant, started_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run([sessionId, this.variantName], function (err) {
        if (err) reject(err);
        else resolve({ conversationId: this.lastID, sessionId });
      });

      stmt.finalize();
    });
  }

  async logMessage(conversationId, role, content, metadata = {}) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO messages (
          conversation_id, role, content, tokens, cost_usd,
          model, temperature, response_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [
          conversationId,
          role,
          content,
          metadata.tokens || null,
          metadata.cost || null,
          metadata.model || null,
          metadata.temperature || null,
          metadata.responseTime || null,
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ messageId: this.lastID });
        },
      );

      stmt.finalize();
    });
  }

  async getConversationHistory(conversationId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT role, content FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
        [conversationId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });
  }

  async updateConversationStats(conversationId, tokens, cost) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        UPDATE conversations
        SET total_messages = total_messages + 1,
            total_tokens = total_tokens + ?,
            total_cost_usd = total_cost_usd + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run([tokens, cost, conversationId], function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });

      stmt.finalize();
    });
  }

  calculateCost(model, promptTokens, completionTokens) {
    const pricing = PRICING[model];
    if (!pricing) return 0;

    const inputCost = promptTokens * pricing.input;
    const outputCost = completionTokens * pricing.output;
    return inputCost + outputCost;
  }

  async chat(conversationId, userMessage) {
    const startTime = Date.now();

    // SAFETY CHECK: Content safety filter
    const safetyCheck = contentSafety.checkSafety(userMessage);
    if (!safetyCheck.safe) {
      console.warn(
        `🛡️ Blocked unsafe content: ${safetyCheck.violations[0].type}`,
      );

      // Log safety metric
      await this.logSafetyMetric(
        conversationId,
        userMessage,
        true,
        safetyCheck.violations[0].type,
      );

      return {
        message: safetyCheck.blockedReason,
        action: "blocked",
        extractedData: {},
        metadata: {
          blocked: true,
          reason: safetyCheck.violations[0].type,
          responseTime: Date.now() - startTime,
        },
      };
    }

    // Log passed safety check
    await this.logSafetyMetric(conversationId, userMessage, false, null);

    // Log user message
    await this.logMessage(conversationId, "user", userMessage);

    // Get conversation history
    const history = await this.getConversationHistory(conversationId);

    // Build messages array
    const messages = [
      { role: "system", content: this.variant.systemPrompt },
      ...history.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    try {
      // SAFETY: Call Groq API with circuit breaker + retry policy
      const completion = await this.circuitBreaker.execute(() =>
        this.retryPolicy.executeWithRetry(
          () =>
            this.client.chat.completions.create({
              model: this.variant.model,
              messages,
              temperature: this.variant.temperature,
              max_tokens: 500,
              response_format: { type: "json_object" },
            }),
          `Groq API (${this.variant.model})`,
        ),
      );

      const responseTime = Date.now() - startTime;
      const assistantMessage = completion.choices[0].message.content;
      const usage = completion.usage;

      // Calculate cost
      const cost = this.calculateCost(
        this.variant.model,
        usage.prompt_tokens,
        usage.completion_tokens,
      );

      // Log assistant message with metadata
      await this.logMessage(conversationId, "assistant", assistantMessage, {
        tokens: usage.total_tokens,
        cost,
        model: this.variant.model,
        temperature: this.variant.temperature,
        responseTime,
      });

      // Update conversation stats
      await this.updateConversationStats(
        conversationId,
        usage.total_tokens,
        cost,
      );

      // Parse response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(assistantMessage);
      } catch {
        parsedResponse = {
          message: assistantMessage,
          action: "continue",
          extracted_data: {},
        };
      }

      // SAFETY CHECK: Response safety (prevent system prompt leaks)
      const responseSafety = contentSafety.checkResponseSafety(
        parsedResponse.message,
      );
      if (!responseSafety.safe) {
        console.warn(`🛡️ Response safety issue: ${responseSafety.reason}`);
        parsedResponse.message = responseSafety.sanitizedMessage;
      }

      return {
        message: parsedResponse.message,
        action: parsedResponse.action,
        extractedData: parsedResponse.extracted_data,
        metadata: {
          model: this.variant.model,
          tokens: usage.total_tokens,
          cost,
          responseTime,
        },
      };
    } catch (error) {
      console.error("Groq API error:", error);
      throw error;
    }
  }

  async checkAvailability(date, time) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count
         FROM appointments
         WHERE appointment_date = ?
         AND appointment_time = ?
         AND status IN ('scheduled', 'confirmed')`,
        [date, time],
        (err, row) => {
          if (err) reject(err);
          else resolve({ available: row.count === 0 });
        },
      );
    });
  }

  async bookAppointment(appointmentData, conversationId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO appointments (
          customer_name, customer_phone, customer_email,
          service_type, appointment_type, appointment_date,
          appointment_time, duration_minutes, notes,
          property_size, special_requirements, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
      `);

      stmt.run(
        [
          appointmentData.name,
          appointmentData.phone,
          appointmentData.email || null,
          appointmentData.serviceType,
          appointmentData.appointmentType,
          appointmentData.date,
          appointmentData.time,
          appointmentData.duration || 60,
          appointmentData.notes || null,
          appointmentData.propertySize || null,
          appointmentData.specialRequirements || null,
        ],
        async function (err) {
          if (err) {
            reject(err);
          } else {
            const appointmentId = this.lastID;

            // Update conversation with appointment
            const updateStmt = db.prepare(`
            UPDATE conversations
            SET appointment_id = ?, booking_completed = 1, ended_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `);

            updateStmt.run(
              [appointmentId, conversationId],
              function (updateErr) {
                if (updateErr) reject(updateErr);
                else resolve({ appointmentId, ...appointmentData });
              },
            );

            updateStmt.finalize();
          }
        },
      );

      stmt.finalize();
    });
  }

  async endConversation(conversationId, success = false, satisfaction = null) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        UPDATE conversations
        SET ended_at = CURRENT_TIMESTAMP,
            customer_satisfaction = ?,
            status = 'ended'
        WHERE id = ?
      `);

      stmt.run([satisfaction, conversationId], function (err) {
        if (err) reject(err);
        else resolve({ success });
      });

      stmt.finalize();
    });
  }

  async logSafetyMetric(conversationId, userMessage, blocked, violationType) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO safety_metrics (
          conversation_id, safety_check_type, user_message,
          blocked, violation_type, created_at
        ) VALUES (?, 'content_safety', ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [conversationId, userMessage, blocked ? 1 : 0, violationType],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        },
      );

      stmt.finalize();
    }).catch((err) => {
      // Table might not exist yet - that's okay
      if (!err.message.includes("no such table")) {
        console.error("Error logging safety metric:", err);
      }
    });
  }

  getSafetyMetrics() {
    return {
      contentSafety: contentSafety.getMetrics(),
      circuitBreaker: this.circuitBreaker.getState(),
      retryPolicy: this.retryPolicy.getMetrics(),
    };
  }
}
