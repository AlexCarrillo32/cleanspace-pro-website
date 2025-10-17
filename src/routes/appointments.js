import express from "express";
import { body, validationResult } from "express-validator";
import { getDatabase } from "../database/init.js";

const router = express.Router();

const appointmentValidation = [
  body("customer_name").trim().isLength({ min: 2, max: 100 }).escape(),
  body("customer_phone").trim().isMobilePhone("any"),
  body("customer_email").optional().trim().isEmail().normalizeEmail(),
  body("service_type").isIn([
    "weekly",
    "biweekly",
    "monthly",
    "onetime",
    "damage_specialist",
    "hospital_specialist",
  ]),
  body("appointment_type").isIn([
    "initial_consultation",
    "regular_cleaning",
    "deep_cleaning",
    "estimate",
  ]),
  body("appointment_date").isISO8601().toDate(),
  body("appointment_time")
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Time must be in HH:MM format"),
  body("duration_minutes").optional().isInt({ min: 30, max: 480 }),
  body("property_size").optional().trim().escape(),
  body("special_requirements").optional().trim().escape(),
  body("notes").optional().trim().escape(),
];

// GET all appointments
router.get("/", async (req, res, next) => {
  try {
    const db = getDatabase();
    const { status, date, limit = 50, offset = 0 } = req.query;

    let query = "SELECT * FROM appointments WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (date) {
      query += " AND appointment_date = ?";
      params.push(date);
    }

    query += " ORDER BY appointment_date ASC, appointment_time ASC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const appointments = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    db.close();

    res.json({
      success: true,
      data: appointments,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: appointments.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET appointment by ID
router.get("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const appointment = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM appointments WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    db.close();

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    res.json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

// POST create new appointment
router.post("/", appointmentValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      inquiry_id,
      customer_name,
      customer_phone,
      customer_email,
      service_type,
      appointment_type,
      appointment_date,
      appointment_time,
      duration_minutes = 60,
      property_size,
      special_requirements,
      notes,
    } = req.body;

    const db = getDatabase();

    const appointmentId = await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO appointments (
          inquiry_id, customer_name, customer_phone, customer_email,
          service_type, appointment_type, appointment_date, appointment_time,
          duration_minutes, property_size, special_requirements, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
      `);

      stmt.run(
        [
          inquiry_id || null,
          customer_name,
          customer_phone,
          customer_email || null,
          service_type,
          appointment_type,
          appointment_date,
          appointment_time,
          duration_minutes,
          property_size || null,
          special_requirements || null,
          notes || null,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        },
      );

      stmt.finalize();
    });

    db.close();

    res.status(201).json({
      success: true,
      message: "Appointment scheduled successfully",
      data: {
        id: appointmentId,
        appointment_date,
        appointment_time,
        status: "scheduled",
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT update appointment
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      appointment_date,
      appointment_time,
      status,
      notes,
      special_requirements,
    } = req.body;

    const db = getDatabase();

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (appointment_date) {
      updates.push("appointment_date = ?");
      params.push(appointment_date);
    }
    if (appointment_time) {
      updates.push("appointment_time = ?");
      params.push(appointment_time);
    }
    if (status) {
      updates.push("status = ?");
      params.push(status);

      // Set confirmation/completion/cancellation timestamps
      if (status === "confirmed") {
        updates.push("confirmed_at = CURRENT_TIMESTAMP");
      } else if (status === "completed") {
        updates.push("completed_at = CURRENT_TIMESTAMP");
      } else if (status === "cancelled") {
        updates.push("cancelled_at = CURRENT_TIMESTAMP");
        if (req.body.cancellation_reason) {
          updates.push("cancellation_reason = ?");
          params.push(req.body.cancellation_reason);
        }
      }
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      params.push(notes);
    }
    if (special_requirements !== undefined) {
      updates.push("special_requirements = ?");
      params.push(special_requirements);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    if (updates.length === 1) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    const query = `UPDATE appointments SET ${updates.join(", ")} WHERE id = ?`;

    const result = await new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    db.close();

    if (result === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    res.json({
      success: true,
      message: "Appointment updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

// DELETE appointment
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const result = await new Promise((resolve, reject) => {
      db.run("DELETE FROM appointments WHERE id = ?", [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    db.close();

    if (result === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    res.json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
