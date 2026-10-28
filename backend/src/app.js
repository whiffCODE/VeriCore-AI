import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";

export const app = express();

app.disable("x-powered-by");

// Configure only the known reverse-proxy hop count.
// Keep TRUST_PROXY_HOPS=0 for direct local development.
if (env.TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
}

app.use(helmet());

app.use(
  express.json({
    limit: "32kb",
    type: "application/json",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(cookieParser());

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: env.APP_NAME,
    status: "healthy",
    environment: env.NODE_ENV,
  });
});

// Register authentication routes here in the next implementation step.

// Keep this after all routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist.",
    },
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err.message);

  res.status(err.status || 500).json({
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
