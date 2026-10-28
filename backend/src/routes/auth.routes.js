
import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  register,
  verifyRegistrationOtp,
  resendRegistrationOtp,
} from "../controllers/auth.controller.js";

import {
  registerSchema,
  verifyRegistrationOtpSchema,
  resendRegistrationOtpSchema,
} from "../validators/auth.validators.js";

import { validateBody } from "../middleware/validate-body.js";

const router = Router();

// Disable rate limiting only in automated tests.
// Rate limits remain active in development and production.
const skipRateLimitInTests = () =>
  process.env.NODE_ENV === "test";

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skip: skipRateLimitInTests,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many registration requests. Try again later.",
    },
  },
});

const otpVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: skipRateLimitInTests,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many OTP verification attempts. Try again later.",
    },
  },
});

const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  skip: skipRateLimitInTests,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many OTP requests. Try again later.",
    },
  },
});

// POST /api/auth/register
router.post(
  "/register",
  registrationLimiter,
  validateBody(registerSchema),
  register,
);

// POST /api/auth/verify-registration-otp
router.post(
  "/verify-registration-otp",
  otpVerificationLimiter,
  validateBody(verifyRegistrationOtpSchema),
  verifyRegistrationOtp,
);

// POST /api/auth/resend-registration-otp
router.post(
  "/resend-registration-otp",
  otpResendLimiter,
  validateBody(resendRegistrationOtpSchema),
  resendRegistrationOtp,
);

export default router;
