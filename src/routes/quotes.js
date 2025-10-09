import express from "express";
import { body, validationResult } from "express-validator";
import { getDatabase } from "../database/init.js";

const router = express.Router();

const quoteValidation = [
  body("name").trim().isLength({ min: 2, max: 100 }).escape(),
  body("phone").trim().isMobilePhone("any"),
  body("service_type").isIn([
    "weekly",
    "biweekly",
    "monthly",
    "onetime",
    "damage_specialist",
    "hospital_specialist",
  ]),
];

router.post("/", quoteValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, phone, service_type } = req.body;
    const db = getDatabase();

    const insertInquiry = new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO inquiries (name, phone, service_type, status)
        VALUES (?, ?, ?, 'quote_requested')
      `);

      stmt.run([name, phone, service_type], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });

      stmt.finalize();
    });

    const inquiryId = await insertInquiry;

    const getServiceRate = new Promise((resolve, reject) => {
      db.get(
        "SELECT base_rate FROM services WHERE name = ? AND active = 1",
        [service_type],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.base_rate || 100.0);
          }
        },
      );
    });

    const baseRate = await getServiceRate;

    const insertQuote = new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO quotes (inquiry_id, service_type, estimated_hours, hourly_rate, total_amount, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);

      const estimatedHours = getEstimatedHours(service_type);
      const totalAmount = baseRate * estimatedHours;

      stmt.run(
        [inquiryId, service_type, estimatedHours, baseRate, totalAmount],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              inquiry_id: inquiryId,
              service_type,
              estimated_hours: estimatedHours,
              hourly_rate: baseRate,
              total_amount: totalAmount,
            });
          }
        },
      );

      stmt.finalize();
    });

    const quote = await insertQuote;
    db.close();

    res.status(201).json({
      success: true,
      message:
        "Quote request submitted successfully! We will contact you soon.",
      data: {
        quote_id: quote.id,
        inquiry_id: quote.inquiry_id,
        estimated_total: quote.total_amount,
        service_type: quote.service_type,
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

    const getQuote = new Promise((resolve, reject) => {
      db.get(
        `
        SELECT q.*, i.name, i.phone, i.email
        FROM quotes q
        JOIN inquiries i ON q.inquiry_id = i.id
        WHERE q.id = ?
      `,
        [id],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        },
      );
    });

    const quote = await getQuote;
    db.close();

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
});

function getEstimatedHours(serviceType) {
  const hourEstimates = {
    weekly: 2,
    biweekly: 3,
    monthly: 4,
    onetime: 6,
    damage_specialist: 8,
    hospital_specialist: 10,
  };
  return hourEstimates[serviceType] || 3;
}

export default router;
