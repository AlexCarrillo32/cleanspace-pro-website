export function initializeAppointmentsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      service_type TEXT NOT NULL,
      appointment_type TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      property_size TEXT,
      special_requirements TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      completed_at DATETIME,
      cancelled_at DATETIME,
      cancellation_reason TEXT,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_appointments_date
    ON appointments(appointment_date, appointment_time)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON appointments(status)
  `);

  console.log('✅ Appointments table initialized');
}

export function initializeConversationsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      inquiry_id INTEGER,
      appointment_id INTEGER,
      variant TEXT DEFAULT 'baseline',
      status TEXT DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      total_messages INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0.0,
      booking_completed INTEGER DEFAULT 0,
      customer_satisfaction INTEGER,
      escalated_to_human INTEGER DEFAULT 0,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries (id),
      FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_conversations_session
    ON conversations(session_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_conversations_variant
    ON conversations(variant)
  `);

  console.log('✅ Conversations table initialized');
}

export function initializeMessagesTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER,
      cost_usd REAL,
      model TEXT,
      temperature REAL,
      response_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id)
  `);

  console.log('✅ Messages table initialized');
}

export function initializeEvaluationSetsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS evaluation_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      test_case TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Evaluation sets table initialized');
}

export function initializeExperimentResultsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS experiment_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_name TEXT NOT NULL,
      variant TEXT NOT NULL,
      conversation_id INTEGER,
      test_case_id INTEGER,
      success INTEGER DEFAULT 0,
      error_message TEXT,
      response_time_ms INTEGER,
      tokens_used INTEGER,
      cost_usd REAL,
      evaluation_score REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id),
      FOREIGN KEY (test_case_id) REFERENCES evaluation_sets (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_experiment_results_variant
    ON experiment_results(experiment_name, variant)
  `);

  console.log('✅ Experiment results table initialized');
}

export function initializeShadowComparisonsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS shadow_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      primary_variant TEXT NOT NULL,
      shadow_variant TEXT NOT NULL,
      primary_response TEXT,
      shadow_response TEXT,
      primary_duration INTEGER,
      shadow_duration INTEGER,
      different INTEGER DEFAULT 0,
      difference_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_shadow_variant
    ON shadow_comparisons(shadow_variant)
  `);

  console.log('✅ Shadow comparisons table initialized');
}

export function initializeSafetyMetricsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS safety_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      safety_check_type TEXT NOT NULL,
      user_message TEXT,
      blocked INTEGER DEFAULT 0,
      violation_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_safety_conversation
    ON safety_metrics(conversation_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_safety_blocked
    ON safety_metrics(blocked)
  `);

  console.log('✅ Safety metrics table initialized');
}

export function initializeResponseCacheTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS response_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_hash TEXT UNIQUE NOT NULL,
      user_message TEXT NOT NULL,
      variant TEXT NOT NULL,
      response_message TEXT NOT NULL,
      response_action TEXT,
      response_data TEXT,
      model TEXT,
      tokens INTEGER,
      cost_usd REAL,
      response_time_ms INTEGER,
      expires_at INTEGER NOT NULL,
      hit_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_cache_hash
    ON response_cache(message_hash)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_cache_variant_expires
    ON response_cache(variant, expires_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_cache_last_accessed
    ON response_cache(last_accessed)
  `);

  console.log('✅ Response cache table initialized');
}

export function initializeDriftDetectionsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS drift_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant TEXT NOT NULL,
      drift_types TEXT NOT NULL,
      severity TEXT NOT NULL,
      baseline_window TEXT,
      recent_window TEXT,
      metrics TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_drift_variant_created
    ON drift_detections(variant, created_at DESC)
  `);

  console.log('✅ Drift detections table initialized');
}

export function initializeRetrainingSessionsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS retraining_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      variant TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      training_data_size INTEGER,
      failure_analysis TEXT,
      new_variant TEXT,
      shadow_analysis TEXT,
      success INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_retraining_variant
    ON retraining_sessions(variant, started_at DESC)
  `);

  console.log('✅ Retraining sessions table initialized');
}

export function initializeModelVersionsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS model_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_name TEXT NOT NULL,
      version INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      metadata TEXT,
      is_active INTEGER DEFAULT 0,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      UNIQUE(variant_name, version)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_model_versions_active
    ON model_versions(variant_name, is_active)
  `);

  console.log('✅ Model versions table initialized');
}

export function initializePIIEventsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS pii_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      session_id TEXT,
      source TEXT NOT NULL,
      pii_detected INTEGER DEFAULT 0,
      pii_types TEXT,
      risk_level TEXT,
      risk_score REAL,
      redacted_count INTEGER DEFAULT 0,
      message_length INTEGER,
      context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_pii_events_conversation
    ON pii_events(conversation_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_pii_events_session
    ON pii_events(session_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_pii_events_risk
    ON pii_events(risk_level, created_at DESC)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_pii_events_detected
    ON pii_events(pii_detected, created_at DESC)
  `);

  console.log('✅ PII events table initialized');
}

export function initializeWorkflowExecutionsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step TEXT,
      state TEXT,
      context TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_message TEXT
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow
    ON workflow_executions(workflow_id, started_at DESC)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
    ON workflow_executions(status, started_at DESC)
  `);

  console.log('✅ Workflow executions table initialized');
}

export function initializeCanaryEventsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS canary_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      canary_variant TEXT,
      stable_variant TEXT,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_canary_events_type
    ON canary_events(event_type, created_at DESC)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_canary_events_variant
    ON canary_events(canary_variant, created_at DESC)
  `);

  console.log('✅ Canary events table initialized');
}
