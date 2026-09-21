import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";

import {
  errorHandler,
  notFound
} from "./middleware/error.js";


import { env } from "./config/env.js";

const app = express();

app.use(
  helmet()
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

app.use(cookieParser());

app.get(
  "/api/v1/health",
  (req, res) => {
    res.json({
      success: true,
      service: "vericore-ai-backend",
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  }
);

app.use(
  "/api/v1/auth",
  authRoutes
);

app.use(notFound);

app.use(errorHandler);

export default app;