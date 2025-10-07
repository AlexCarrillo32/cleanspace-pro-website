# CleanSpace Pro AI Agent - Lifecycle Management Plan

## Executive Summary

This document outlines the comprehensive lifecycle management system for the CleanSpace Pro AI scheduling agent, including drift detection, automated retraining triggers, and model versioning with rollback capabilities.

**Key Features:**
- Automated drift detection across 5 metrics
- Retraining triggers based on performance degradation
- Model versioning with seamless rollback
- Zero-downtime updates via shadow deployment

---

## 1. Drift Detection System

### Overview

The drift detection system continuously monitors AI agent performance to detect degradation before it impacts business metrics.

### Architecture

```
[Baseline Window: 7 days] ← Compare → [Recent Window: 24 hours]
         ↓
    Drift Analysis (5 metrics)
         ↓
[Trigger Retraining if threshold exceeded]
```

### Monitored Metrics

#### 1.1 Booking Rate Drift

**What it detects:** Decrease in successful appointment bookings

**Threshold:** 10% drop triggers alert

**Example:**
```json
{
  "baselineRate": "75.00%",
  "recentRate": "65.00%",
  "change": "-13.33%",
  "drift": true,
  "severity": "medium"
}
```

**Causes:**
- Agent not collecting required information
- Unclear communication patterns
- New edge cases not handled

#### 1.2 Escalation Rate Drift

**What it detects:** Increase in conversations requiring human intervention

**Threshold:** 15% increase triggers alert

**Example:**
```json
{
  "baselineRate": "5.00%",
  "recentRate": "8.00%",
  "change": "+60.00%",
  "drift": true,
  "severity": "high"
}
```

**Causes:**
- Complex queries agent can't handle
- Customer frustration patterns
- New service types not in training data

#### 1.3 Cost Drift

**What it detects:** Increase in average cost per conversation

**Threshold:** 20% increase triggers alert

**Example:**
```json
{
  "baselineCost": "$0.000130",
  "recentCost": "$0.000170",
  "change": "+30.77%",
  "drift": true,
  "severity": "medium"
}
```

**Causes:**
- Longer conversations (more messages)
- Switching to more expensive models
- Inefficient prompt patterns

#### 1.4 Response Time Drift

**What it detects:** Slowdown in agent response times

**Threshold:** 25% increase triggers alert

*(Currently not implemented - requires response time tracking)*

#### 1.5 Action Distribution Drift

**What it detects:** Changes in agent behavior patterns using Chi-squared test

**Threshold:** χ² > 9.488 (95% confidence, 4 degrees of freedom)

**Example:**
```json
{
  "baselineDistribution": [
    {"action": "collect_info", "percentage": "40.00%"},
    {"action": "check_availability", "percentage": "30.00%"},
    {"action": "book_appointment", "percentage": "25.00%"},
    {"action": "confirm", "percentage": "5.00%"}
  ],
  "recentDistribution": [
    {"action": "collect_info", "percentage": "60.00%"},
    {"action": "check_availability", "percentage": "20.00%"},
    {"action": "book_appointment", "percentage": "15.00%"},
    {"action": "confirm", "percentage": "5.00%"}
  ],
  "chiSquared": "12.456",
  "drift": true,
  "severity": "high"
}
```

**Interpretation:** Agent stuck in information collection, not progressing to booking

### Configuration

```javascript
{
  // Performance thresholds
  bookingRateThreshold: 0.1,        // 10% drop
  escalationRateThreshold: 0.15,    // 15% increase
  costIncreaseThreshold: 0.2,       // 20% increase
  responseTimeThreshold: 0.25,      // 25% increase

  // Statistical thresholds
  minSamplesForComparison: 50,      // Need 50 conversations
  confidenceLevel: 0.95,            // 95% confidence

  // Time windows
  baselineWindow: 7 * 24 * 60 * 60 * 1000,  // 7 days
  recentWindow: 24 * 60 * 60 * 1000,        // 24 hours
  checkInterval: 60 * 60 * 1000             // Check every hour
}
```

### API Usage

**Detect Drift:**
```bash
curl "http://localhost:3001/api/lifecycle/drift/detect?variant=baseline"
```

Response:
```json
{
  "variant": "baseline",
  "timestamp": "2025-10-07T12:00:00Z",
  "baseline": {
    "start": "2025-09-30T12:00:00Z",
    "end": "2025-10-06T12:00:00Z"
  },
  "recent": {
    "start": "2025-10-06T12:00:00Z",
    "end": "2025-10-07T12:00:00Z"
  },
  "metrics": {
    "bookingRate": {
      "baselineRate": "75.00%",
      "recentRate": "65.00%",
      "change": "-13.33%",
      "drift": true,
      "severity": "medium"
    },
    "escalationRate": { ... },
    "cost": { ... },
    "responseTime": { ... },
    "actionDistribution": { ... }
  },
  "drifts": ["booking_rate", "escalation_rate"],
  "overallDrift": true
}
```

**Get Drift History:**
```bash
curl "http://localhost:3001/api/lifecycle/drift/history?variant=baseline&limit=10"
```

**Get Drift Metrics:**
```bash
curl "http://localhost:3001/api/lifecycle/drift/metrics"
```

---

## 2. Retraining Orchestration

### Overview

Automated retraining pipeline triggered by drift detection, using production data to improve agent performance.

### Retraining Workflow

```
1. Drift Detection
   ↓
2. Check Triggers (severity + cooldown)
   ↓
3. Collect Training Data (production logs)
   ↓
4. Analyze Failures (pattern extraction)
   ↓
5. Generate Improved Prompt
   ↓
6. Create New Variant (version++)
   ↓
7. Run Offline Evaluation
   ↓
8. Shadow Deployment Test (100 samples)
   ↓
9. Analyze Results
   ↓
10. Promote or Rollback
```

### Retraining Triggers

#### 2.1 Automatic Triggers

Retraining starts when:
1. **High severity drift** detected in any metric
2. **Multiple medium severity drifts** (2 or more)
3. **Cooldown period** has passed (7 days since last retraining)

#### 2.2 Manual Triggers

Retraining can be manually started via API:
```bash
curl -X POST http://localhost:3001/api/lifecycle/retraining/start \
  -H "Content-Type: application/json" \
  -d '{"variant": "baseline", "options": {}}'
```

### Training Data Collection

**Sources:**
- Last 500 conversations (configurable)
- Both successful and failed bookings
- Escalated conversations for failure analysis

**Example:**
```javascript
{
  minTrainingExamples: 50,
  maxTrainingExamples: 500,
  includeFailures: true,
  includeSuccesses: true
}
```

### Failure Analysis

**Patterns Detected:**
- Pricing issues (customer asks about cost repeatedly)
- Availability confusion (agent doesn't check calendar)
- Unclear responses (customer says "I don't understand")
- Technical errors (API failures, validation errors)

**Example Output:**
```json
{
  "totalFailures": 25,
  "escalations": 15,
  "avgMessagesBeforeFailure": 8.5,
  "commonIssues": [
    {
      "issue": "pricing",
      "count": 12,
      "percentage": "48.00%"
    },
    {
      "issue": "availability",
      "count": 8,
      "percentage": "32.00%"
    }
  ]
}
```

### Prompt Improvement

Based on failure analysis, the system suggests improvements:

**Example:**
```json
{
  "improvements": [
    "Be proactive in explaining pricing structure",
    "Always check availability before suggesting times",
    "Ask clarifying questions when intent is ambiguous"
  ],
  "suggestedChanges": [
    "Add explicit pricing guidance",
    "Improve availability checking flow",
    "Add clarification prompts"
  ]
}
```

*(In production, this would use GPT-4 to generate the actual new system prompt)*

### Testing Requirements

**Offline Evaluation:**
- Run 10 test cases
- Must achieve ≥ 0.8 average score

**Shadow Deployment:**
- 100 production samples
- Must achieve:
  - ≥ 5% success rate improvement
  - ≤ 10% cost increase
  - ≤ 5% difference rate

### API Usage

**Check Triggers:**
```bash
curl "http://localhost:3001/api/lifecycle/retraining/check?variant=baseline"
```

Response:
```json
{
  "shouldRetrain": true,
  "reason": "Drift detected",
  "driftAnalysis": { ... },
  "triggers": ["booking_rate", "escalation_rate"]
}
```

**Start Retraining:**
```bash
curl -X POST http://localhost:3001/api/lifecycle/retraining/start \
  -H "Content-Type: application/json" \
  -d '{"variant": "baseline"}'
```

Response:
```json
{
  "message": "Retraining started - shadow test in progress",
  "session": {
    "id": "retrain_baseline_1696680000000",
    "variant": "baseline",
    "version": 2,
    "status": "shadow_testing",
    "trainingDataSize": 500,
    "newVariant": "baseline_v2"
  },
  "nextSteps": [
    "Wait for 100 samples",
    "Monitor shadow deployment metrics",
    "Call /api/lifecycle/retraining/finalize to complete"
  ]
}
```

**Finalize Retraining:**
```bash
curl -X POST http://localhost:3001/api/lifecycle/retraining/finalize \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "retrain_baseline_1696680000000"}'
```

Response (success):
```json
{
  "success": true,
  "message": "Retraining successful - baseline_v2 promoted",
  "session": {
    "shadowAnalysis": { ... },
    "promotionCheck": {
      "shouldPromote": true,
      "reasons": []
    }
  }
}
```

Response (failure):
```json
{
  "success": false,
  "message": "Retraining unsuccessful - rolled back",
  "reasons": [
    "High difference rate (8.00% > 5.00%)",
    "Minimal performance improvement (3.00% < 5.00%)"
  ]
}
```

**Get Status:**
```bash
curl "http://localhost:3001/api/lifecycle/retraining/status"
```

---

## 3. Model Version Management

### Overview

Track all prompt variants with versioning, enabling rollbacks and A/B testing across versions.

### Version Lifecycle

```
Register → Activate → Test → [Promote/Rollback] → Tag
```

### Features

#### 3.1 Version Registration

Register new prompt versions with metadata:

```bash
curl -X POST http://localhost:3001/api/lifecycle/versions/register \
  -H "Content-Type: application/json" \
  -d '{
    "variantName": "baseline",
    "systemPrompt": "You are a friendly scheduling assistant...",
    "metadata": {
      "description": "Improved booking flow with pricing guidance",
      "createdBy": "retraining_system",
      "changes": [
        "Added explicit pricing structure",
        "Improved availability checking",
        "Added clarification prompts"
      ]
    }
  }'
```

Response:
```json
{
  "variantName": "baseline",
  "version": 2,
  "systemPrompt": "...",
  "metadata": {
    "createdAt": "2025-10-07T12:00:00Z",
    "createdBy": "retraining_system",
    "description": "...",
    "changes": [ ... ]
  }
}
```

#### 3.2 Version Activation

Activate a specific version (deactivates all others):

```bash
curl -X POST http://localhost:3001/api/lifecycle/versions/activate \
  -H "Content-Type: application/json" \
  -d '{
    "variantName": "baseline",
    "version": 2
  }'
```

#### 3.3 Version Rollback

Rollback to previous version:

```bash
curl -X POST http://localhost:3001/api/lifecycle/versions/rollback \
  -H "Content-Type: application/json" \
  -d '{"variantName": "baseline"}'
```

Response:
```json
{
  "variantName": "baseline",
  "previousVersion": 2,
  "currentVersion": 1,
  "rolledBackAt": "2025-10-07T13:00:00Z"
}
```

#### 3.4 Version Comparison

Compare performance metrics between versions:

```bash
curl "http://localhost:3001/api/lifecycle/versions/compare?variantName=baseline&version1=1&version2=2"
```

Response:
```json
{
  "variantName": "baseline",
  "version1": {
    "version": 1,
    "totalConversations": 500,
    "bookings": 375,
    "escalations": 25,
    "avgCost": 0.00013,
    "avgTokens": 450,
    "bookingRate": 0.75,
    "escalationRate": 0.05
  },
  "version2": {
    "version": 2,
    "totalConversations": 100,
    "bookings": 82,
    "escalations": 3,
    "avgCost": 0.00015,
    "avgTokens": 500,
    "bookingRate": 0.82,
    "escalationRate": 0.03
  },
  "differences": {
    "bookingRate": 9.33,        // +9.33%
    "escalationRate": -40.00,   // -40%
    "avgCost": 15.38,           // +15.38%
    "avgTokens": 11.11          // +11.11%
  }
}
```

#### 3.5 Version Diff

Compare prompts between versions:

```bash
curl "http://localhost:3001/api/lifecycle/versions/diff?variantName=baseline&version1=1&version2=2"
```

Response:
```json
{
  "variantName": "baseline",
  "version1": {
    "version": 1,
    "promptLength": 1200,
    "changes": []
  },
  "version2": {
    "version": 2,
    "promptLength": 1450,
    "changes": [
      "Added explicit pricing structure",
      "Improved availability checking"
    ]
  },
  "lengthDiff": 250,
  "samePrompt": false
}
```

#### 3.6 Version Tagging

Tag versions for easy reference:

```bash
curl -X POST http://localhost:3001/api/lifecycle/versions/tag \
  -H "Content-Type: application/json" \
  -d '{
    "variantName": "baseline",
    "version": 2,
    "tag": "production",
    "description": "Stable version with 82% booking rate"
  }'
```

Common tags:
- `production` - Currently deployed version
- `stable` - Tested and verified
- `experimental` - Under testing
- `rollback` - Safe fallback version

#### 3.7 List All Variants

```bash
curl "http://localhost:3001/api/lifecycle/versions/list"
```

Response:
```json
{
  "variants": [
    {
      "variant_name": "baseline",
      "latestVersion": 3,
      "totalVersions": 3,
      "activeVersion": 2
    },
    {
      "variant_name": "professional",
      "latestVersion": 2,
      "totalVersions": 2,
      "activeVersion": 2
    }
  ]
}
```

---

## 4. Database Schema

### Drift Detections

```sql
CREATE TABLE drift_detections (
  id INTEGER PRIMARY KEY,
  variant TEXT NOT NULL,
  drift_types TEXT NOT NULL,          -- "booking_rate,escalation_rate"
  severity TEXT NOT NULL,             -- "low", "medium", "high"
  baseline_window TEXT,               -- JSON: {start, end}
  recent_window TEXT,                 -- JSON: {start, end}
  metrics TEXT,                       -- JSON: full drift analysis
  created_at DATETIME
);
```

### Retraining Sessions

```sql
CREATE TABLE retraining_sessions (
  id INTEGER PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  variant TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,               -- "collecting_data", "shadow_testing", "promoted", "rolled_back"
  training_data_size INTEGER,
  failure_analysis TEXT,              -- JSON
  new_variant TEXT,
  shadow_analysis TEXT,               -- JSON
  success INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME
);
```

### Model Versions

```sql
CREATE TABLE model_versions (
  id INTEGER PRIMARY KEY,
  variant_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  metadata TEXT,                      -- JSON: {description, changes, createdBy}
  is_active INTEGER DEFAULT 0,
  tags TEXT,                          -- JSON: {"production": "...", "stable": "..."}
  created_at DATETIME,
  activated_at DATETIME,
  UNIQUE(variant_name, version)
);
```

---

## 5. Operational Workflows

### 5.1 Daily Drift Monitoring

**Frequency:** Every 24 hours (automated)

```bash
# Check drift for all variants
for variant in baseline professional casual; do
  curl "http://localhost:3001/api/lifecycle/drift/detect?variant=$variant"
done
```

**Action Items:**
- If drift detected with `severity: "low"` → Monitor
- If drift detected with `severity: "medium"` → Investigate causes
- If drift detected with `severity: "high"` → Trigger retraining

### 5.2 Retraining Workflow

**Trigger:** High severity drift or multiple medium drifts

```bash
# 1. Check if retraining should be triggered
curl "http://localhost:3001/api/lifecycle/retraining/check?variant=baseline"

# 2. Start retraining
curl -X POST .../lifecycle/retraining/start -d '{"variant": "baseline"}'
# → Returns sessionId

# 3. Monitor shadow deployment
watch -n 300 'curl -s http://localhost:3001/api/reliability/shadow/status | jq'

# 4. Wait for 100 samples (typically 1-2 days)

# 5. Analyze shadow results
curl "http://localhost:3001/api/reliability/shadow/analysis"

# 6. Finalize retraining
curl -X POST .../lifecycle/retraining/finalize -d '{"sessionId": "..."}'
```

**Success Criteria:**
- ✅ Booking rate improved by ≥ 5%
- ✅ Escalation rate decreased
- ✅ Cost increase ≤ 10%
- ✅ Difference rate ≤ 5%

### 5.3 Emergency Rollback

**Scenario:** Production issues after version activation

```bash
# 1. Rollback to previous version
curl -X POST http://localhost:3001/api/lifecycle/versions/rollback \
  -H "Content-Type: application/json" \
  -d '{"variantName": "baseline"}'

# 2. Verify rollback
curl "http://localhost:3001/api/lifecycle/versions/active?variantName=baseline"

# 3. Monitor metrics
curl "http://localhost:3001/api/reliability/metrics"
```

**Rollback SLA:** < 2 minutes

### 5.4 Version Promotion Workflow

**Scenario:** Promote shadow variant to primary after testing

```bash
# 1. Compare versions
curl ".../lifecycle/versions/compare?variantName=baseline&version1=1&version2=2"

# 2. Activate new version
curl -X POST .../lifecycle/versions/activate -d '{"variantName": "baseline", "version": 2}'

# 3. Tag as production
curl -X POST .../lifecycle/versions/tag -d '{
  "variantName": "baseline",
  "version": 2,
  "tag": "production"
}'
```

---

## 6. Monitoring and Alerting

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Drift detection frequency | Times drift detected per week | > 2 per week |
| Retraining success rate | % of retrainings that get promoted | < 50% |
| Version rollback frequency | Rollbacks per month | > 1 per month |
| Booking rate | % of conversations resulting in bookings | < 70% |
| Escalation rate | % of conversations escalated to human | > 10% |
| Avg cost per conversation | USD per conversation | > $0.002 |

### Dashboard Endpoints

**Overall Status:**
```bash
curl "http://localhost:3001/api/lifecycle/status"
```

**Drift Dashboard:**
```bash
curl "http://localhost:3001/api/lifecycle/drift/metrics"
```

**Retraining Dashboard:**
```bash
curl "http://localhost:3001/api/lifecycle/retraining/status"
```

---

## 7. Best Practices

### 7.1 Retraining Frequency

**Recommended:**
- Minimum: Every 2 weeks if no drift
- Maximum: Once per week
- Cooldown: 7 days between retrainings

**Rationale:** Too frequent retraining can lead to overfitting to recent data and instability.

### 7.2 Version Management

**Tags:**
- Tag stable versions as `production`
- Tag previous production as `rollback`
- Tag experimental versions as `experimental`

**Retention:**
- Keep all versions indefinitely (low storage cost)
- Active versions: 1 per variant
- Rollback-ready versions: Last 3 versions

### 7.3 Testing Rigor

**Before Promotion:**
- ✅ Offline evaluation score ≥ 0.8
- ✅ Shadow test with 100+ samples
- ✅ No high severity regressions
- ✅ Manual spot check of 10 conversations

**After Promotion:**
- ✅ Monitor for 24 hours
- ✅ Check escalation rate
- ✅ Validate booking rate
- ✅ Review customer feedback

---

## 8. Troubleshooting

### Issue: Drift detected but no obvious cause

**Diagnosis:**
1. Check drift history: `curl .../drift/history`
2. Analyze failure patterns in database
3. Review recent conversations manually

**Resolution:**
- If pattern unclear, wait for more data
- If pattern clear, trigger manual retraining

### Issue: Retraining promoted but performance worse

**Diagnosis:**
1. Compare versions: `curl .../versions/compare`
2. Check shadow analysis for false positives

**Resolution:**
1. Immediate rollback: `curl -X POST .../versions/rollback`
2. Investigate shadow deployment methodology
3. Increase minimum samples for promotion

### Issue: Too many retrainings triggered

**Diagnosis:**
1. Check drift thresholds in config
2. Verify baseline window is appropriate

**Resolution:**
1. Increase drift thresholds (e.g., 15% instead of 10%)
2. Increase cooldown period (e.g., 14 days instead of 7)
3. Require multiple consecutive drift detections

---

## 9. Future Enhancements

### Q1 2026

- [ ] GPT-4 powered prompt improvement generation
- [ ] Automated failure pattern extraction with LLM
- [ ] Multi-armed bandit for variant selection
- [ ] Conversation quality scoring (sentiment analysis)

### Q2 2026

- [ ] Reinforcement learning from human feedback (RLHF)
- [ ] Automatic A/B test orchestration
- [ ] Predictive drift detection (forecast degradation)
- [ ] Self-healing prompts (auto-fix common issues)

---

## 10. API Reference

### Drift Detection

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lifecycle/drift/detect` | GET | Detect drift for variant |
| `/api/lifecycle/drift/history` | GET | Get drift detection history |
| `/api/lifecycle/drift/metrics` | GET | Get drift detector metrics |

### Retraining

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lifecycle/retraining/check` | GET | Check if retraining should trigger |
| `/api/lifecycle/retraining/start` | POST | Start retraining process |
| `/api/lifecycle/retraining/finalize` | POST | Finalize retraining after shadow test |
| `/api/lifecycle/retraining/status` | GET | Get retraining status |
| `/api/lifecycle/retraining/history` | GET | Get retraining history |

### Version Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lifecycle/versions/register` | POST | Register new version |
| `/api/lifecycle/versions/activate` | POST | Activate specific version |
| `/api/lifecycle/versions/rollback` | POST | Rollback to previous version |
| `/api/lifecycle/versions/active` | GET | Get active version |
| `/api/lifecycle/versions/history` | GET | Get version history |
| `/api/lifecycle/versions/compare` | GET | Compare two versions |
| `/api/lifecycle/versions/diff` | GET | Get prompt diff |
| `/api/lifecycle/versions/tag` | POST | Tag a version |
| `/api/lifecycle/versions/list` | GET | List all variants |

### Overall Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lifecycle/status` | GET | Overall lifecycle status |

---

## Conclusion

The CleanSpace Pro AI Agent lifecycle management system provides production-grade monitoring and self-healing capabilities:

✅ **Automated drift detection** across 5 performance metrics
✅ **Intelligent retraining triggers** based on severity and patterns
✅ **Zero-downtime updates** via shadow deployment testing
✅ **Version management** with instant rollback capability
✅ **Comprehensive monitoring** with detailed analytics

The system ensures the AI agent continuously improves while maintaining high reliability and booking rates.
