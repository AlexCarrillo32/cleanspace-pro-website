import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  initializeAppointmentsTable,
  initializeConversationsTable,
  initializeMessagesTable,
  initializeEvaluationSetsTable,
  initializeExperimentResultsTable,
  initializeShadowComparisonsTable,
  initializeSafetyMetricsTable,
  initializeResponseCacheTable,
  initializeDriftDetectionsTable,
  initializeRetrainingSessionsTable,
  initializeModelVersionsTable,
  initializePIIEventsTable,
  initializeWorkflowExecutionsTable
} from './appointments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/cleanspace.db');

export async function initializeDatabase() {
  try {
    // Ensure database directory exists
    const dbDir = path.dirname(DB_PATH);
    await fs.mkdir(dbDir, { recursive: true });

    const db = new sqlite3.Database(DB_PATH);

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Create inquiries table
        db.run(`
          CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            service_type TEXT NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'new',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create quotes table
        db.run(`
          CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inquiry_id INTEGER,
            service_type TEXT NOT NULL,
            estimated_hours REAL,
            hourly_rate REAL,
            total_amount REAL,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (inquiry_id) REFERENCES inquiries (id)
          )
        `);

        // Create services table for pricing
        db.run(`
          CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            base_rate REAL NOT NULL,
            description TEXT,
            active BOOLEAN DEFAULT 1
          )
        `);

        // Insert default service rates
        db.run(`
          INSERT OR IGNORE INTO services (name, base_rate, description) VALUES
          ('weekly', 75.00, 'Weekly cleaning service'),
          ('biweekly', 90.00, 'Bi-weekly cleaning service'),
          ('monthly', 120.00, 'Monthly cleaning service'),
          ('onetime', 150.00, 'One-time deep cleaning service'),
          ('damage_specialist', 200.00, 'Water, fire, and restoration cleanup'),
          ('hospital_specialist', 250.00, 'Terminal cleaning and medical facility sanitation')
        `);

        // Initialize AI agent tables before closing
        initializeAppointmentsTable(db);
        initializeConversationsTable(db);
        initializeMessagesTable(db);
        initializeEvaluationSetsTable(db);
        initializeExperimentResultsTable(db);
        initializeShadowComparisonsTable(db);
        initializeSafetyMetricsTable(db);
        initializeResponseCacheTable(db);
        initializeDriftDetectionsTable(db);
        initializeRetrainingSessionsTable(db);
        initializeModelVersionsTable(db);
        initializePIIEventsTable(db);
        initializeWorkflowExecutionsTable(db);

        db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  } catch (error) {
    throw new Error(`Database initialization failed: ${error.message}`);
  }
}

export function getDatabase() {
  return new sqlite3.Database(DB_PATH);
}