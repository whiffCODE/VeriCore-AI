
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import sessionRoutes from "./routes/session.routes.js";

export const app = express();

// Hide Express fingerprint.
app.disable("x-powered-by");

// Reverse proxy configuration.
// Keep TRUST_PROXY_HOPS=0 for direct local development.
// Configure the exact trusted proxy hop count in production.
if (env.TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
}

// Security headers.
app.use(helmet());

// Request body parsing.
app.use(
  express.json({
    limit: "32kb",
    type: "application/json",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "16kb",
  }),
);

// HTTP-only cookie parsing.
app.use(cookieParser());

// General API rate limiting.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    skip: () => env.NODE_ENV === "test",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    },
  }),
);

// Health check.
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: env.APP_NAME,
    status: "healthy",
    environment: env.NODE_ENV,
  });
});

// Authentication endpoints:
// POST /api/auth/register
// POST /api/auth/verify-registration-otp
// POST /api/auth/resend-registration-otp
app.use("/api/auth", authRoutes);
app.use("/api/auth", sessionRoutes);

// Handle unknown routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist.",
    },
  });
});

// Centralized error handler.
// Keep this after every route and the 404 handler.
app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err.message);

  const status =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  res.status(status).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : err.message,
    },
  });
});

