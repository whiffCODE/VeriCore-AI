
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: {
        code: "ADMIN_ACCESS_REQUIRED",
        message: "You do not have permission to perform this action.",
      },
    });
  }

  next();
}
