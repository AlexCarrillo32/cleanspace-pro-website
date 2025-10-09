export function errorHandler(err, req, res, _next) {
  console.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: err.details || err.message,
    });
  }

  if (err.code === "SQLITE_CONSTRAINT") {
    return res.status(409).json({
      success: false,
      message: "Database constraint violation",
      error: "Duplicate entry or invalid reference",
    });
  }

  if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
    return res.status(503).json({
      success: false,
      message: "Service temporarily unavailable",
      error: "External service connection failed",
    });
  }

  if (err.status && err.status < 500) {
    return res.status(err.status).json({
      success: false,
      message: err.message || "Client error",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.originalUrl,
  });
}
