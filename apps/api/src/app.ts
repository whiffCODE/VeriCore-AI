import express from "express";

import healthRouter from "./routes/health.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/not-found.middleware.js";

const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to VeriCore AI API",
  });
});

app.use("/api/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;