# 🤖 AI Scheduling Agent - Quick Start

## Setup (2 minutes)

```bash
# 1. Get Groq API key (free)
# Visit: https://console.groq.com

# 2. Add to .env
echo "GROQ_API_KEY=your_key_here" >> .env

# 3. Install dependencies
npm install

# 4. Start server
npm start  # or npm run dev

# 5. Server running at http://localhost:3001
```

---

## Test It (30 seconds)

```bash
# Start a conversation
curl -X POST http://localhost:3001/api/chat/start \
  -H "Content-Type: application/json" \
  -d '{"variant":"baseline"}'

# Response: { "sessionId": "abc123", "welcomeMessage": "Hi! I'm here to help..." }

# Send a message
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"abc123",
    "message":"I need a cleaning for my 3-bedroom house next Monday at 2pm"
  }'

# Response: AI extracts info and suggests booking
```

---

## Run Offline Evaluation (1 minute)

```bash
# Seed test cases (do once)
node scripts/evaluate.js seed

# Run evaluation
node scripts/evaluate.js eval baseline

# Output: 10 test cases executed with scores, costs, timing
```

---

## Run A/B Test (2 minutes)

```bash
# Compare two variants
node scripts/evaluate.js ab-test baseline professional

# Output: Side-by-side comparison with winner
```

---

## Check Metrics

```bash
# Overall metrics
curl http://localhost:3001/api/analytics/metrics | jq

# By variant (A/B test results)
curl http://localhost:3001/api/analytics/metrics/by-variant | jq

# Cost analysis
curl http://localhost:3001/api/analytics/cost-analysis | jq

# Experiment results
curl http://localhost:3001/api/analytics/experiments/offline_eval | jq
```

---

## What You Get

✅ **AI agent** that schedules appointments via chat
✅ **3 variants** for A/B testing (baseline, professional, casual)
✅ **Full logging** - Every prompt, response, token, cost tracked
✅ **10 test cases** - Happy paths, edge cases, conflicts
✅ **Cost tracking** - Real-time USD calculation
✅ **Analytics API** - Booking rates, satisfaction, costs
✅ **CLI tools** - Easy evaluation workflow

---

## Cost

**Essentially free with Groq:**

- Baseline: $0.03 per 1,000 bookings
- Professional: $0.39 per 1,000 bookings

---

## Architecture

```
User → API → SchedulingAgent → Groq (LLaMA 3.1)
                     ↓
              SQLite Database
           (logs, metrics, tests)
```

---

## Files Structure

```
src/
  services/
    SchedulingAgent.js       - AI agent with 3 variants
    EvaluationService.js     - Offline eval & A/B testing
  routes/
    chat.js                  - Chat API endpoints
    analytics.js             - Metrics & analytics API
  database/
    appointments.js          - 5 new tables schema

scripts/
  evaluate.js                - CLI for running evals

AI_AGENT_DOCUMENTATION.md    - Full technical docs
AI_AGENT_SUMMARY.md          - Feature summary
README_AI_AGENT.md           - This file
```

---

## Example Output

### Offline Evaluation

```
🧪 Running offline evaluation for variant: baseline

Testing: Valid Appointment Request...
  ✓ Score: 85% | Tokens: 145 | Cost: $0.000012

Testing: Conflicting Time Request...
  ✓ Score: 90% | Tokens: 178 | Cost: $0.000015

...

📊 Summary:
  Success Rate: 80.0%
  Average Score: 85.3%
  Total Cost: $0.00012
  Avg Response Time: 234ms
```

### A/B Test

```
🔬 Running A/B Test: baseline vs professional

Variant A (baseline):     80.0% success | $0.00012 cost
Variant B (professional): 90.0% success | $0.0017 cost

🏆 Winner: professional (+10% booking rate)
```

---

## Next Steps

1. **Deploy** - Add Groq API key and run
2. **Evaluate** - Run `node scripts/evaluate.js ab-test baseline professional`
3. **Monitor** - Check `/api/analytics/metrics/by-variant`
4. **Optimize** - Pick winning variant based on booking rate vs cost
5. **Integrate** - Add chat widget to website

---

## Support

- Full docs: `AI_AGENT_DOCUMENTATION.md`
- Summary: `AI_AGENT_SUMMARY.md`
- CLI help: `node scripts/evaluate.js help`

---

**Ready to schedule appointments with AI! 🚀**
