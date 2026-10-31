export function errorHandler(err, req, res, next) {
  // If headers were already sent, let Express handle the remaining error.
  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500;

  // Expected client errors are safe to return to the caller.
  // Unexpected server errors should not expose internal details.
  const message =
    statusCode < 500
      ? err.message || "Bad request"
      : "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled request error:", err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
}
