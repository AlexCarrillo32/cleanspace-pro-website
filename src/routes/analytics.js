import express from "express";
import { getDatabase } from "../database/init.js";

const router = express.Router();

router.get("/conversations", async (req, res, next) => {
  try {
    const { variant, startDate, endDate, limit = 100 } = req.query;
    const db = getDatabase();

    let query = "SELECT * FROM conversations WHERE 1=1";
    const params = [];

    if (variant) {
      query += " AND variant = ?";
      params.push(variant);
    }

    if (startDate) {
      query += " AND started_at >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND started_at <= ?";
      params.push(endDate);
    }

    query += " ORDER BY started_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const conversations = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/metrics", async (req, res, next) => {
  try {
    const { variant, startDate, endDate } = req.query;
    const db = getDatabase();

    let whereClause = "WHERE 1=1";
    const params = [];

    if (variant) {
      whereClause += " AND variant = ?";
      params.push(variant);
    }

    if (startDate) {
      whereClause += " AND started_at >= ?";
      params.push(startDate);
    }

    if (endDate) {
      whereClause += " AND started_at <= ?";
      params.push(endDate);
    }

    const metrics = await new Promise((resolve, reject) => {
      db.get(
        `
        SELECT
          COUNT(*) as total_conversations,
          SUM(booking_completed) as successful_bookings,
          SUM(total_messages) as total_messages,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost_usd) as total_cost,
          AVG(total_messages) as avg_messages_per_conversation,
          AVG(total_tokens) as avg_tokens_per_conversation,
          AVG(total_cost_usd) as avg_cost_per_conversation,
          AVG(customer_satisfaction) as avg_satisfaction,
          SUM(escalated_to_human) as escalations
        FROM conversations
        ${whereClause}
      `,
        params,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    const bookingRate =
      metrics.total_conversations > 0
        ? (metrics.successful_bookings / metrics.total_conversations) * 100
        : 0;

    const escalationRate =
      metrics.total_conversations > 0
        ? (metrics.escalations / metrics.total_conversations) * 100
        : 0;

    res.json({
      success: true,
      data: {
        ...metrics,
        booking_rate_percent: bookingRate,
        escalation_rate_percent: escalationRate,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/metrics/by-variant", async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const db = getDatabase();

    let whereClause = "WHERE 1=1";
    const params = [];

    if (startDate) {
      whereClause += " AND started_at >= ?";
      params.push(startDate);
    }

    if (endDate) {
      whereClause += " AND started_at <= ?";
      params.push(endDate);
    }

    const variantMetrics = await new Promise((resolve, reject) => {
      db.all(
        `
        SELECT
          variant,
          COUNT(*) as total_conversations,
          SUM(booking_completed) as successful_bookings,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost_usd) as total_cost,
          AVG(total_messages) as avg_messages,
          AVG(customer_satisfaction) as avg_satisfaction
        FROM conversations
        ${whereClause}
        GROUP BY variant
        ORDER BY successful_bookings DESC
      `,
        params,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });

    // Calculate rates
    const enrichedMetrics = variantMetrics.map((m) => ({
      ...m,
      booking_rate_percent:
        (m.successful_bookings / m.total_conversations) * 100,
      cost_per_booking:
        m.successful_bookings > 0 ? m.total_cost / m.successful_bookings : 0,
      avg_cost_per_conversation: m.total_cost / m.total_conversations,
    }));

    res.json({
      success: true,
      data: enrichedMetrics,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/experiments/:experimentName", async (req, res, next) => {
  try {
    const { experimentName } = req.params;
    const db = getDatabase();

    const results = await new Promise((resolve, reject) => {
      db.all(
        `
        SELECT
          variant,
          COUNT(*) as total_tests,
          SUM(success) as successful_tests,
          AVG(evaluation_score) as avg_score,
          SUM(tokens_used) as total_tokens,
          SUM(cost_usd) as total_cost,
          AVG(response_time_ms) as avg_response_time
        FROM experiment_results
        WHERE experiment_name LIKE ?
        GROUP BY variant
      `,
        [`${experimentName}%`],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });

    const enrichedResults = results.map((r) => ({
      ...r,
      success_rate_percent: (r.successful_tests / r.total_tests) * 100,
      avg_score_percent: r.avg_score * 100,
      cost_per_test: r.total_cost / r.total_tests,
    }));

    res.json({
      success: true,
      data: {
        experimentName,
        variants: enrichedResults,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/appointments", async (req, res, next) => {
  try {
    const { status, startDate, endDate, limit = 50 } = req.query;
    const db = getDatabase();

    let query = "SELECT * FROM appointments WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (startDate) {
      query += " AND appointment_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND appointment_date <= ?";
      params.push(endDate);
    }

    query += " ORDER BY appointment_date DESC, appointment_time DESC LIMIT ?";
    params.push(parseInt(limit));

    const appointments = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      success: true,
      data: appointments,
      count: appointments.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/cost-analysis", async (req, res, next) => {
  try {
    const { variant, groupBy = "day" } = req.query;
    const db = getDatabase();

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-W%W";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    let whereClause = "WHERE 1=1";
    const params = [];

    if (variant) {
      whereClause += " AND variant = ?";
      params.push(variant);
    }

    const costAnalysis = await new Promise((resolve, reject) => {
      db.all(
        `
        SELECT
          strftime('${dateFormat}', started_at) as time_period,
          COUNT(*) as conversation_count,
          SUM(total_cost_usd) as total_cost,
          SUM(booking_completed) as bookings,
          AVG(total_cost_usd) as avg_cost_per_conversation
        FROM conversations
        ${whereClause}
        GROUP BY time_period
        ORDER BY time_period DESC
        LIMIT 30
      `,
        params,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });

    const enrichedAnalysis = costAnalysis.map((a) => ({
      ...a,
      cost_per_booking: a.bookings > 0 ? a.total_cost / a.bookings : 0,
    }));

    res.json({
      success: true,
      data: enrichedAnalysis,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
