import Groq from "groq-sdk";
import { getDatabase } from "../database/init.js";

const PRICING_RULES = {
  // Base rates per service type (per hour)
  serviceRates: {
    weekly: 75,
    biweekly: 85,
    monthly: 95,
    onetime: 120,
    damage_specialist: 150,
    hospital_specialist: 175,
  },

  // Property size multipliers
  sizeMultipliers: {
    small: { sqft: [0, 1000], hours: 2, factor: 1.0 },
    medium: { sqft: [1001, 2500], hours: 3, factor: 1.2 },
    large: { sqft: [2501, 4000], hours: 4, factor: 1.4 },
    xlarge: { sqft: [4001, 10000], hours: 6, factor: 1.6 },
  },

  // Additional service add-ons
  addOns: {
    deep_clean: 50,
    carpet_cleaning: 75,
    window_washing: 100,
    move_in_out: 150,
    pet_friendly_products: 25,
    eco_friendly_products: 30,
  },

  // Urgency fees
  urgency: {
    same_day: 75,
    next_day: 50,
    within_week: 0,
  },
};

export class QuoteAgent {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not found in environment variables");
    }

    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    this.systemPrompt = `You are an AI quote assistant for CleanSpace Pro cleaning services.

Your job is to:
1. Understand the customer's cleaning needs through conversation
2. Ask clarifying questions about:
   - Property type (home, apartment, office, etc.)
   - Property size (square feet or number of rooms)
   - Service type (weekly, biweekly, monthly, one-time, specialized)
   - Specific needs (deep clean, carpet, windows, etc.)
   - Timeline/urgency
3. Extract ALL relevant information
4. Be friendly, professional, and helpful

IMPORTANT: You must extract specific data to calculate accurate quotes. If missing key info (size, service type), ask for it.

Respond in JSON format:
{
  "message": "your conversational response to the customer",
  "needsMoreInfo": true/false,
  "missingFields": ["field1", "field2"],
  "extractedData": {
    "propertyType": "residential/commercial",
    "squareFeet": number,
    "serviceType": "weekly/biweekly/monthly/onetime/damage_specialist/hospital_specialist",
    "addOns": ["deep_clean", "carpet_cleaning", "window_washing", "move_in_out"],
    "urgency": "same_day/next_day/within_week/flexible",
    "specialRequirements": "string"
  }
}`;
  }

  async chat(conversationHistory, userMessage) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        messages,
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const response = JSON.parse(completion.choices[0].message.content);

      return {
        message: response.message,
        needsMoreInfo: response.needsMoreInfo,
        missingFields: response.missingFields || [],
        extractedData: response.extractedData || {},
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        },
      };
    } catch (error) {
      console.error("QuoteAgent error:", error);
      throw new Error("Failed to process quote request");
    }
  }

  calculateQuote(extractedData) {
    const {
      squareFeet = 1500,
      serviceType = "onetime",
      addOns = [],
      urgency = "flexible",
    } = extractedData;

    // Determine property size category
    let sizeCategory = "medium";
    for (const [category, config] of Object.entries(
      PRICING_RULES.sizeMultipliers,
    )) {
      if (
        squareFeet >= config.sqft[0] &&
        squareFeet <= config.sqft[1]
      ) {
        sizeCategory = category;
        break;
      }
    }

    const sizeConfig = PRICING_RULES.sizeMultipliers[sizeCategory];
    const baseRate = PRICING_RULES.serviceRates[serviceType] || 100;

    // Calculate base cost
    const estimatedHours = sizeConfig.hours;
    const baseCost = baseRate * estimatedHours * sizeConfig.factor;

    // Add-ons cost
    const addOnsCost = addOns.reduce((total, addOn) => {
      return total + (PRICING_RULES.addOns[addOn] || 0);
    }, 0);

    // Urgency fee
    const urgencyFee = PRICING_RULES.urgency[urgency] || 0;

    // Total
    const subtotal = baseCost + addOnsCost;
    const total = subtotal + urgencyFee;

    // Discount for recurring services
    let discount = 0;
    if (["weekly", "biweekly", "monthly"].includes(serviceType)) {
      discount = subtotal * 0.1; // 10% discount for recurring
    }

    const finalTotal = Math.round(total - discount);

    return {
      breakdown: {
        baseService: {
          serviceType,
          rate: baseRate,
          hours: estimatedHours,
          subtotal: Math.round(baseCost),
        },
        propertySize: {
          squareFeet,
          category: sizeCategory,
          multiplier: sizeConfig.factor,
        },
        addOns: addOns.map((addOn) => ({
          name: addOn,
          cost: PRICING_RULES.addOns[addOn] || 0,
        })),
        urgency: {
          type: urgency,
          fee: urgencyFee,
        },
        discount: {
          type: ["weekly", "biweekly", "monthly"].includes(serviceType)
            ? "recurring_service"
            : "none",
          amount: Math.round(discount),
        },
      },
      subtotal: Math.round(subtotal),
      urgencyFee,
      discount: Math.round(discount),
      total: finalTotal,
      estimatedDuration: `${estimatedHours} hours`,
    };
  }

  async generateQuote(conversationHistory, userMessage) {
    // Get AI response and extract data
    const aiResponse = await this.chat(conversationHistory, userMessage);

    // If we have enough info, calculate quote
    if (!aiResponse.needsMoreInfo && aiResponse.extractedData.squareFeet) {
      const quote = this.calculateQuote(aiResponse.extractedData);

      return {
        ...aiResponse,
        quote,
        readyToBook: true,
      };
    }

    // Still need more info
    return {
      ...aiResponse,
      quote: null,
      readyToBook: false,
    };
  }

  async saveQuote(quoteData, customerData) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      // First, save inquiry
      const inquiryStmt = db.prepare(`
        INSERT INTO inquiries (name, phone, email, service_type, status)
        VALUES (?, ?, ?, ?, 'quote_provided')
      `);

      inquiryStmt.run(
        [
          customerData.name,
          customerData.phone,
          customerData.email || null,
          quoteData.extractedData.serviceType,
        ],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          const inquiryId = this.lastID;

          // Then save quote
          const quoteStmt = db.prepare(`
            INSERT INTO quotes (
              inquiry_id, service_type, estimated_hours,
              hourly_rate, total_amount, notes, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
          `);

          const estimatedHours = parseInt(
            quoteData.quote.estimatedDuration.split(" ")[0],
          );
          const notes = JSON.stringify({
            addOns: quoteData.extractedData.addOns || [],
            specialRequirements:
              quoteData.extractedData.specialRequirements,
            breakdown: quoteData.quote.breakdown,
          });

          quoteStmt.run(
            [
              inquiryId,
              quoteData.extractedData.serviceType,
              estimatedHours,
              quoteData.quote.breakdown.baseService.rate,
              quoteData.quote.total,
              notes,
            ],
            function (err) {
              if (err) {
                reject(err);
              } else {
                resolve({
                  inquiryId,
                  quoteId: this.lastID,
                  total: quoteData.quote.total,
                });
              }
            },
          );

          quoteStmt.finalize();
        },
      );

      inquiryStmt.finalize();
    });
  }
}

export default QuoteAgent;
