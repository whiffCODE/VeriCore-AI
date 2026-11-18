
import type { ErrorRequestHandler } from "express";

import { AppError } from "../utils/app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });

    return;
  }

  console.error("Unexpected server error:", error);

  res.status(500).json({
    success: false,
    error: {
      message: "An unexpected server error occurred.",
    },
  });
};
