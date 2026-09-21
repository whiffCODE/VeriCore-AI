export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
}

export function errorHandler(
  error,
  req,
  res,
  next
) {
  console.error(error);

  const statusCode =
    error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message
  });
}