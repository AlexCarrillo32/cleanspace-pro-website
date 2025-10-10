import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { initializeDatabase } from "./src/database/init.js";
import quoteRoutes from "./src/routes/quotes.js";
import inquiryRoutes from "./src/routes/inquiries.js";
import chatRoutes from "./src/routes/chat.js";
import analyticsRoutes from "./src/routes/analytics.js";
import reliabilityRoutes from "./src/routes/reliability.js";
import lifecycleRoutes from "./src/routes/lifecycle.js";
import optimizationRoutes from "./src/routes/optimization.js";
import metricsRoutes from "./src/routes/metrics.js";
import safetyRoutes from "./src/routes/safety.js";
import reliabilityMonitoringRoutes from "./src/routes/reliability-monitoring.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import canaryRoutes from "./src/routes/canary.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
});
app.use("/api/", limiter);

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  }),
);

// Logging
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files (frontend)
app.use(
  express.static(".", {
    index: "index.html",
  }),
);

// API Routes
app.use("/api/quotes", quoteRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reliability", reliabilityRoutes);
app.use("/api/lifecycle", lifecycleRoutes);
app.use("/api/optimization", optimizationRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/safety", safetyRoutes);
app.use("/api/reliability-monitoring", reliabilityMonitoringRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/canary", canaryRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "CleanSpace Pro API",
  });
});

// Serve frontend for any non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    res.status(404).json({ error: "API endpoint not found" });
  }
});

// Error handling middleware
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log("✅ Database initialized successfully");

    app.listen(PORT, () => {
      console.log(`🚀 CleanSpace Pro server running on port ${PORT}`);
      console.log(`📱 Frontend: http://localhost:${PORT}`);
      console.log(`🔌 API: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
