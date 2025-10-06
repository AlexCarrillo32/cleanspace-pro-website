# CleanSpace Pro - AI Scheduling Agent Documentation

## 🎯 Overview

CleanSpace Pro now features an AI-powered scheduling agent built with **Groq** (free tier, ultra-fast inference) that can schedule appointments and estimates through natural conversation.

### Key Features

✅ **Full Conversation Logging** - Every prompt, response, tokens, and cost tracked
✅ **Offline Evaluation** - 10 test cases covering happy paths, edge cases, conflicts
✅ **A/B Testing Framework** - Compare 3 variants (baseline, professional, casual)
✅ **Cost Tracking** - Token usage and USD cost per conversation
✅ **Metrics Dashboard** - Booking rates, satisfaction scores, escalation rates
✅ **Database Persistence** - SQLite tables for conversations, messages, appointments

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│               (Chat Widget / SMS / Email)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Express)                       │
│  /api/chat/start | /message | /book | /end | /history      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               SchedulingAgent Service                        │
│  • Manages conversation state                               │
│  • Logs all messages with metadata                          │
│  • Calculates token costs                                   │
│  • Checks availability                                      │
│  • Books appointments                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌──────────────────────┐    ┌──────────────────────┐
│   Groq API           │    │   SQLite Database    │
│  (LLaMA 3.1)         │    │  • conversations     │
│  • 8B Instant        │    │  • messages          │
│  • 70B Versatile     │    │  • appointments      │
└──────────────────────┘    │  • eval sets         │
                            │  • experiments       │
                            └──────────────────────┘
```

---

## 🗄️ Database Schema

### conversations
Tracks entire conversation session with cost and outcome metrics.

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  inquiry_id INTEGER,
  appointment_id INTEGER,
  variant TEXT DEFAULT 'baseline',        -- A/B test variant
  status TEXT DEFAULT 'active',
  started_at DATETIME,
  ended_at DATETIME,
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,         -- Sum of all tokens
  total_cost_usd REAL DEFAULT 0.0,        -- Sum of all costs
  booking_completed INTEGER DEFAULT 0,    -- Success metric
  customer_satisfaction INTEGER,          -- 1-5 rating
  escalated_to_human INTEGER DEFAULT 0
);
```

### messages
Logs every individual message with detailed metadata.

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,                     -- 'user' or 'assistant'
  content TEXT NOT NULL,
  tokens INTEGER,                         -- Token count for this message
  cost_usd REAL,                          -- Cost for this message
  model TEXT,                             -- e.g., 'llama-3.1-8b-instant'
  temperature REAL,
  response_time_ms INTEGER,
  created_at DATETIME
);
```

### appointments
Stores scheduled appointments with full details.

```sql
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY,
  inquiry_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  service_type TEXT NOT NULL,             -- residential, commercial
  appointment_type TEXT NOT NULL,         -- estimate, cleaning
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled',        -- scheduled, confirmed, completed, cancelled
  notes TEXT,
  property_size TEXT,
  special_requirements TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  confirmed_at DATETIME,
  completed_at DATETIME,
  cancelled_at DATETIME,
  cancellation_reason TEXT
);
```

### evaluation_sets
Offline test cases for evaluating agent performance.

```sql
CREATE TABLE evaluation_sets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  test_case TEXT NOT NULL,                -- JSON: {messages: [...], setupConflict: {...}}
  expected_outcome TEXT NOT NULL,         -- JSON: {shouldBook: true, hasName: true, ...}
  category TEXT NOT NULL,                 -- happy_path, conflict, edge_case, clarification
  created_at DATETIME
);
```

### experiment_results
Results from offline evaluations and A/B tests.

```sql
CREATE TABLE experiment_results (
  id INTEGER PRIMARY KEY,
  experiment_name TEXT NOT NULL,
  variant TEXT NOT NULL,
  conversation_id INTEGER,
  test_case_id INTEGER,
  success INTEGER DEFAULT 0,              -- 0 or 1
  error_message TEXT,
  response_time_ms INTEGER,
  tokens_used INTEGER,
  cost_usd REAL,
  evaluation_score REAL,                  -- 0.0 to 1.0
  notes TEXT,
  created_at DATETIME
);
```

---

## 🔧 API Endpoints

### Chat Endpoints

#### POST /api/chat/start
Start a new conversation session.

**Request:**
```json
{
  "variant": "baseline"  // or "professional" or "casual"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "conversationId": 123,
    "variant": "baseline",
    "welcomeMessage": "Hi! I'm here to help..."
  }
}
```

#### POST /api/chat/message
Send a message to the agent.

**Request:**
```json
{
  "sessionId": "uuid",
  "message": "I need a cleaning service",
  "variant": "baseline"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Great! I'd be happy to help...",
    "action": "collect_info",
    "extractedData": {
      "name": "John Smith",
      "phone": "5551234567"
    },
    "metadata": {
      "model": "llama-3.1-8b-instant",
      "tokens": 145,
      "cost": 0.000012,
      "responseTime": 234
    }
  }
}
```

#### POST /api/chat/book
Book an appointment.

**Request:**
```json
{
  "sessionId": "uuid",
  "appointmentData": {
    "name": "John Smith",
    "phone": "5551234567",
    "email": "john@example.com",
    "serviceType": "residential",
    "appointmentType": "estimate",
    "date": "2025-10-15",
    "time": "14:00",
    "duration": 60,
    "notes": "3-bedroom house deep clean"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment scheduled successfully!",
  "data": {
    "appointmentId": 456,
    ...appointmentData
  }
}
```

#### POST /api/chat/end
End conversation and collect feedback.

**Request:**
```json
{
  "sessionId": "uuid",
  "satisfaction": 5  // 1-5 rating
}
```

#### GET /api/chat/history/:sessionId
Get conversation history.

**Response:**
```json
{
  "success": true,
  "data": [
    { "role": "user", "content": "I need cleaning" },
    { "role": "assistant", "content": "I'd be happy to help!" }
  ]
}
```

### Analytics Endpoints

#### GET /api/analytics/metrics
Get aggregate metrics.

**Query Params:** `variant`, `startDate`, `endDate`

**Response:**
```json
{
  "success": true,
  "data": {
    "total_conversations": 150,
    "successful_bookings": 120,
    "booking_rate_percent": 80.0,
    "total_tokens": 45000,
    "total_cost": 0.35,
    "avg_cost_per_conversation": 0.0023,
    "avg_satisfaction": 4.5,
    "escalation_rate_percent": 5.0
  }
}
```

#### GET /api/analytics/metrics/by-variant
Compare metrics across variants (A/B test results).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "variant": "baseline",
      "total_conversations": 50,
      "successful_bookings": 40,
      "booking_rate_percent": 80.0,
      "cost_per_booking": 0.0025,
      "avg_satisfaction": 4.2
    },
    {
      "variant": "professional",
      "total_conversations": 50,
      "successful_bookings": 45,
      "booking_rate_percent": 90.0,
      "cost_per_booking": 0.0035,
      "avg_satisfaction": 4.6
    }
  ]
}
```

#### GET /api/analytics/experiments/:experimentName
Get results from offline evaluation or A/B test.

**Response:**
```json
{
  "success": true,
  "data": {
    "experimentName": "ab_test_1728234567",
    "variants": [
      {
        "variant": "baseline",
        "total_tests": 10,
        "successful_tests": 8,
        "success_rate_percent": 80.0,
        "avg_score_percent": 75.3,
        "total_cost": 0.0012,
        "cost_per_test": 0.00012
      }
    ]
  }
}
```

#### GET /api/analytics/cost-analysis
Cost tracking over time.

**Query Params:** `variant`, `groupBy` (hour/day/week/month)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "time_period": "2025-10-06",
      "conversation_count": 25,
      "total_cost": 0.05,
      "bookings": 20,
      "cost_per_booking": 0.0025
    }
  ]
}
```

---

## 🧪 Offline Evaluation & A/B Testing

### Running Evaluations

```bash
# Seed test cases (do this once)
node scripts/evaluate.js seed

# Run offline evaluation for a variant
node scripts/evaluate.js eval baseline
node scripts/evaluate.js eval professional
node scripts/evaluate.js eval casual

# Run A/B test between two variants
node scripts/evaluate.js ab-test baseline professional
node scripts/evaluate.js ab-test baseline casual
```

### Test Cases Included

1. **Valid Appointment Request** (happy_path)
2. **Conflicting Time Request** (conflict)
3. **Out of Business Hours** (edge_case)
4. **Incomplete Information** (clarification)
5. **Same Day Request** (edge_case)
6. **Price Inquiry** (information)
7. **Cancellation Request** (modification)
8. **Multiple Service Types** (complex)
9. **Vague Request** (clarification)
10. **Commercial Client** (complex)

### Evaluation Metrics

Each test case is scored 0.0 - 1.0 based on:
- **Booking success** (30% weight)
- **Data extraction** (name, phone, email, service type)
- **Appropriate responses** (offers alternatives, explains constraints)
- **Tone** (remains polite, professional, helpful)
- **Follow-up** (asks clarifying questions when needed)

---

## 🎨 Agent Variants

### Baseline (Fast & Friendly)
- **Model:** llama-3.1-8b-instant
- **Temperature:** 0.7
- **Cost:** $0.05 / 1M input tokens, $0.08 / 1M output tokens
- **Use Case:** High-volume, cost-sensitive deployments
- **Tone:** Friendly, warm, conversational

### Professional (Balanced)
- **Model:** llama-3.1-70b-versatile
- **Temperature:** 0.5
- **Cost:** $0.59 / 1M input tokens, $0.79 / 1M output tokens
- **Use Case:** Premium experience, higher booking rates
- **Tone:** Professional, efficient, solution-oriented

### Casual (Fun & Upbeat)
- **Model:** llama-3.1-8b-instant
- **Temperature:** 0.9
- **Cost:** $0.05 / 1M input tokens, $0.08 / 1M output tokens
- **Use Case:** Younger demographics, brand differentiation
- **Tone:** Fun, upbeat, emoji-friendly 🧹✨

---

## 📈 Cost Analysis

### Example Costs (Based on Groq Pricing)

**Baseline Variant (8B model):**
- Average conversation: ~500 tokens
- Cost per conversation: $0.000025 (< 1 cent per 400 conversations)
- Cost per booking (80% rate): $0.00003

**Professional Variant (70B model):**
- Average conversation: ~500 tokens
- Cost per conversation: $0.00035 (< 1 cent per 3 conversations)
- Cost per booking (90% rate): $0.00039

**At 1,000 bookings/month:**
- Baseline: **$0.03/month** (practically free!)
- Professional: **$0.39/month** (still incredibly cheap)

---

## 🚀 Quick Start

### 1. Get Groq API Key

Sign up at [console.groq.com](https://console.groq.com) (free tier available).

### 2. Set Environment Variable

```bash
# Add to .env
GROQ_API_KEY=gsk_your_key_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

### 5. Seed Test Cases

```bash
node scripts/evaluate.js seed
```

### 6. Run Evaluation

```bash
# Test baseline variant
node scripts/evaluate.js eval baseline

# Run A/B test
node scripts/evaluate.js ab-test baseline professional
```

### 7. Test Chat API

```bash
# Start conversation
curl -X POST http://localhost:3001/api/chat/start \
  -H "Content-Type: application/json" \
  -d '{"variant":"baseline"}'

# Send message
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"your-session-id",
    "message":"I need a cleaning service for my 3-bedroom house"
  }'
```

---

## 📊 Monitoring & Optimization

### Key Metrics to Track

1. **Booking Rate** - % of conversations that result in booking
2. **Cost per Booking** - Total cost / successful bookings
3. **Customer Satisfaction** - Average 1-5 rating
4. **Escalation Rate** - % requiring human intervention
5. **Response Time** - Average milliseconds per response
6. **Token Usage** - Average tokens per conversation

### Optimization Tips

- **Use baseline variant** for high-volume, cost-sensitive scenarios
- **Use professional variant** when booking rate > cost savings
- **Monitor escalation rate** - if >10%, improve prompts
- **A/B test regularly** - Run weekly tests to optimize performance
- **Analyze failed bookings** - Review conversations where booking_completed = 0

---

## 🔒 Security & Best Practices

1. **Rate Limiting** - Already configured (100 requests / 15 min per IP)
2. **Input Validation** - All messages validated & sanitized
3. **API Key Security** - Store in .env, never commit
4. **Database Backups** - Regularly backup SQLite database
5. **PII Handling** - Customer data stored securely, GDPR-compliant deletion available

---

## 🎯 Roadmap

- [ ] Add voice interface (Groq Whisper integration)
- [ ] Multi-language support
- [ ] Calendar integration (Google Calendar API)
- [ ] SMS interface (Twilio integration)
- [ ] Sentiment analysis per message
- [ ] Auto-escalation triggers
- [ ] Real-time dashboard (WebSocket)
- [ ] Advanced NLP features (intent classification, entity extraction)

---

## 📚 Additional Resources

- [Groq Documentation](https://console.groq.com/docs)
- [LLaMA 3.1 Model Card](https://www.llama.com/docs/model-cards-and-prompt-formats/meta-llama-3-1)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [SQLite Performance Tips](https://www.sqlite.org/performance.html)

---

**Built with ❤️ for CleanSpace Pro**
