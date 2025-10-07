/**
 * Model Version Manager
 *
 * Manages AI agent prompt variants with versioning:
 * - Track all prompt versions
 * - Compare performance across versions
 * - Rollback to previous versions
 * - A/B test versions
 */

import { getDatabase } from "../database/init.js";
import { SchedulingAgent } from "./SchedulingAgent.js";

export class ModelVersionManager {
  constructor() {
    this.versions = new Map(); // variantName -> { version, prompt, metadata }
    this.activeVersions = new Map(); // variantName -> activeVersion
  }

  /**
   * Register a new prompt version
   */
  async registerVersion(variantName, systemPrompt, metadata = {}) {
    const db = getDatabase();

    // Get current version number for this variant
    const currentVersion = await this.getCurrentVersion(variantName);
    const newVersion = currentVersion + 1;

    const versionData = {
      variantName,
      version: newVersion,
      systemPrompt,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        createdBy: metadata.createdBy || "system",
        description: metadata.description || "",
        changes: metadata.changes || [],
      },
    };

    // Save to database
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO model_versions (
          variant_name, version, system_prompt, metadata,
          is_active, created_at
        ) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [
          variantName,
          newVersion,
          systemPrompt,
          JSON.stringify(versionData.metadata),
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ versionId: this.lastID });
        },
      );

      stmt.finalize();
    });

    // Update in-memory cache
    const versionKey = `${variantName}_v${newVersion}`;
    this.versions.set(versionKey, versionData);

    console.log(`📝 Registered new version: ${versionKey}`);

    return versionData;
  }

  /**
   * Get current version number for a variant
   */
  async getCurrentVersion(variantName) {
    const db = getDatabase();

    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT MAX(version) as currentVersion
         FROM model_versions
         WHERE variant_name = ?`,
        [variantName],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.currentVersion || 0);
        },
      );
    }).catch(() => 0);

    return result;
  }

  /**
   * Activate a specific version
   */
  async activateVersion(variantName, version) {
    const db = getDatabase();

    // Deactivate all versions for this variant
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE model_versions
         SET is_active = 0
         WHERE variant_name = ?`,
        [variantName],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    // Activate the specified version
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        UPDATE model_versions
        SET is_active = 1, activated_at = CURRENT_TIMESTAMP
        WHERE variant_name = ? AND version = ?
      `);

      stmt.run([variantName, version], function (err) {
        if (err) reject(err);
        else {
          if (this.changes === 0) {
            reject(new Error(`Version not found: ${variantName} v${version}`));
          } else {
            resolve();
          }
        }
      });

      stmt.finalize();
    });

    // Update in-memory cache
    this.activeVersions.set(variantName, version);

    console.log(`✅ Activated version: ${variantName} v${version}`);

    return {
      variantName,
      activeVersion: version,
      activatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get active version for a variant
   */
  async getActiveVersion(variantName) {
    const db = getDatabase();

    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM model_versions
         WHERE variant_name = ? AND is_active = 1
         LIMIT 1`,
        [variantName],
        (err, row) => {
          if (err) reject(err);
          else
            resolve(
              row
                ? {
                    variantName: row.variant_name,
                    version: row.version,
                    systemPrompt: row.system_prompt,
                    metadata: JSON.parse(row.metadata || "{}"),
                    activatedAt: row.activated_at,
                  }
                : null,
            );
        },
      );
    }).catch(() => null);

    return result;
  }

  /**
   * Get all versions for a variant
   */
  async getVersionHistory(variantName, limit = 20) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM model_versions
         WHERE variant_name = ?
         ORDER BY version DESC
         LIMIT ?`,
        [variantName, limit],
        (err, rows) => {
          if (err) reject(err);
          else
            resolve(
              (rows || []).map((row) => ({
                variantName: row.variant_name,
                version: row.version,
                systemPrompt: row.system_prompt,
                metadata: JSON.parse(row.metadata || "{}"),
                isActive: row.is_active === 1,
                createdAt: row.created_at,
                activatedAt: row.activated_at,
              })),
            );
        },
      );
    }).catch(() => []);
  }

  /**
   * Compare two versions
   */
  async compareVersions(variantName, version1, version2) {
    const db = getDatabase();

    // Get performance metrics for version 1
    const v1Metrics = await this.getVersionMetrics(variantName, version1);

    // Get performance metrics for version 2
    const v2Metrics = await this.getVersionMetrics(variantName, version2);

    // Calculate differences
    const comparison = {
      variantName,
      version1: {
        version: version1,
        ...v1Metrics,
      },
      version2: {
        version: version2,
        ...v2Metrics,
      },
      differences: {
        bookingRate:
          ((v2Metrics.bookingRate - v1Metrics.bookingRate) /
            v1Metrics.bookingRate) *
          100,
        escalationRate:
          ((v2Metrics.escalationRate - v1Metrics.escalationRate) /
            v1Metrics.escalationRate) *
          100,
        avgCost:
          ((v2Metrics.avgCost - v1Metrics.avgCost) / v1Metrics.avgCost) * 100,
        avgTokens:
          ((v2Metrics.avgTokens - v1Metrics.avgTokens) / v1Metrics.avgTokens) *
          100,
      },
    };

    return comparison;
  }

  /**
   * Get performance metrics for a specific version
   */
  async getVersionMetrics(variantName, version) {
    const db = getDatabase();

    // This is a simplified version - in production you'd track
    // which conversations used which version
    const metrics = await new Promise((resolve, reject) => {
      db.get(
        `SELECT
          COUNT(*) as totalConversations,
          SUM(booking_completed) as bookings,
          SUM(escalated_to_human) as escalations,
          AVG(total_cost_usd) as avgCost,
          AVG(total_tokens) as avgTokens
         FROM conversations
         WHERE variant = ?`,
        [`${variantName}_v${version}`],
        (err, row) => {
          if (err) reject(err);
          else
            resolve({
              totalConversations: row.totalConversations || 0,
              bookings: row.bookings || 0,
              escalations: row.escalations || 0,
              avgCost: row.avgCost || 0,
              avgTokens: row.avgTokens || 0,
              bookingRate:
                row.totalConversations > 0
                  ? row.bookings / row.totalConversations
                  : 0,
              escalationRate:
                row.totalConversations > 0
                  ? row.escalations / row.totalConversations
                  : 0,
            });
        },
      );
    }).catch(() => ({
      totalConversations: 0,
      bookings: 0,
      escalations: 0,
      avgCost: 0,
      avgTokens: 0,
      bookingRate: 0,
      escalationRate: 0,
    }));

    return metrics;
  }

  /**
   * Rollback to previous version
   */
  async rollback(variantName) {
    const activeVersion = await this.getActiveVersion(variantName);

    if (!activeVersion) {
      throw new Error(`No active version found for ${variantName}`);
    }

    const previousVersion = activeVersion.version - 1;

    if (previousVersion < 1) {
      throw new Error(`No previous version to rollback to for ${variantName}`);
    }

    // Activate previous version
    await this.activateVersion(variantName, previousVersion);

    console.log(
      `↩️ Rolled back ${variantName}: v${activeVersion.version} → v${previousVersion}`,
    );

    return {
      variantName,
      previousVersion: activeVersion.version,
      currentVersion: previousVersion,
      rolledBackAt: new Date().toISOString(),
    };
  }

  /**
   * Get version diff (compare prompts)
   */
  async getVersionDiff(variantName, version1, version2) {
    const history = await this.getVersionHistory(variantName);

    const v1 = history.find((v) => v.version === version1);
    const v2 = history.find((v) => v.version === version2);

    if (!v1 || !v2) {
      throw new Error(`Version not found`);
    }

    // Simple diff - in production you'd use a proper diff library
    const diff = {
      variantName,
      version1: {
        version: version1,
        promptLength: v1.systemPrompt.length,
        changes: v1.metadata.changes || [],
      },
      version2: {
        version: version2,
        promptLength: v2.systemPrompt.length,
        changes: v2.metadata.changes || [],
      },
      lengthDiff: v2.systemPrompt.length - v1.systemPrompt.length,
      samePrompt: v1.systemPrompt === v2.systemPrompt,
    };

    return diff;
  }

  /**
   * Tag a version
   */
  async tagVersion(variantName, version, tag, description = "") {
    const db = getDatabase();

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE model_versions
         SET tags = json_insert(COALESCE(tags, '{}'), '$.${tag}', ?)
         WHERE variant_name = ? AND version = ?`,
        [description, variantName, version],
        function (err) {
          if (err) reject(err);
          else {
            if (this.changes === 0) {
              reject(
                new Error(`Version not found: ${variantName} v${version}`),
              );
            } else {
              resolve();
            }
          }
        },
      );
    });

    console.log(`🏷️ Tagged ${variantName} v${version}: ${tag}`);

    return {
      variantName,
      version,
      tag,
      description,
    };
  }

  /**
   * List all variants
   */
  async listVariants() {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT
          variant_name,
          MAX(version) as latestVersion,
          COUNT(*) as totalVersions,
          SUM(CASE WHEN is_active = 1 THEN version ELSE 0 END) as activeVersion
         FROM model_versions
         GROUP BY variant_name
         ORDER BY variant_name`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    }).catch(() => []);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      totalVersions: this.versions.size,
      activeVersions: Object.fromEntries(this.activeVersions),
    };
  }
}

// Singleton instance
export const modelVersionManager = new ModelVersionManager();
