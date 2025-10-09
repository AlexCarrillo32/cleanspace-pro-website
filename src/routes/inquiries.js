import express from "express";
import { body, validationResult } from "express-validator";
import { getDatabase } from "../database/init.js";

const router = express.Router();

const inquiryValidation = [
  body("name").trim().isLength({ min: 2, max: 100 }).escape(),
  body("phone").trim().isMobilePhone("any"),
  body("email").optional().isEmail().normalizeEmail(),
  body("message").optional().trim().isLength({ max: 1000 }).escape(),
];

router.post("/", inquiryValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, phone, email, message, service_type } = req.body;
    const db = getDatabase();

    const insertInquiry = new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO inquiries (name, phone, email, message, service_type, status)
        VALUES (?, ?, ?, ?, ?, 'new')
      `);

      stmt.run(
        [
          name,
          phone,
          email || null,
          message || null,
          service_type || "general",
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              name,
              phone,
              email,
              message,
              service_type: service_type || "general",
            });
          }
        },
      );

      stmt.finalize();
    });

    const inquiry = await insertInquiry;
    db.close();

    res.status(201).json({
      success: true,
      message:
        "Your inquiry has been submitted successfully! We will contact you soon.",
      data: {
        inquiry_id: inquiry.id,
        name: inquiry.name,
        service_type: inquiry.service_type,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const db = getDatabase();

    let query = "SELECT * FROM inquiries";
    let params = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const getInquiries = new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    const inquiries = await getInquiries;
    db.close();

    res.json({
      success: true,
      data: inquiries,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: inquiries.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const getInquiry = new Promise((resolve, reject) => {
      db.get("SELECT * FROM inquiries WHERE id = ?", [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    const inquiry = await getInquiry;
    db.close();

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    res.json({
      success: true,
      data: inquiry,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["new", "contacted", "quoted", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: " + validStatuses.join(", "),
      });
    }

    const db = getDatabase();

    const updateStatus = new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        UPDATE inquiries
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run([status, id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });

      stmt.finalize();
    });

    const changes = await updateStatus;
    db.close();

    if (changes === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    res.json({
      success: true,
      message: "Status updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
