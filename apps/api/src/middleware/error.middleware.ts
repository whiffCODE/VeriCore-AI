import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  const statusCode =
    typeof error.statusCode === "number" ? error.statusCode : 500;

  const message =
    statusCode === 500
      ? "An unexpected server error occurred."
      : error.message;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
    },
  });
};