import express from "express";

import cookieParser from "cookie-parser";
import healthRouter from "./routes/health.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/not-found.middleware.js";


const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to VeriCore AI API",
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;