import rateLimit from "express-rate-limit";

export const authRateLimit =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many authentication requests. Please try again later."
    }
  });