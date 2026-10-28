
import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  register,
  verifyRegistrationOtp,
  resendRegistrationOtp,
} from "../controllers/auth.controller.js";

import {
  forgotPassword,
  resetPassword,
} from "../controllers/recovery.controller.js";

import {
  registerSchema,
  verifyRegistrationOtpSchema,
  resendRegistrationOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  recoverUserIdSchema,
  requestEmailRecoverySchema,
  verifyEmailRecoverySchema,
} from "../validators/auth.validators.js";

import {
  recoverUserId,
  requestEmailRecovery,
  verifyEmailRecovery,
} from "../controllers/identity-recovery.controller.js";


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


const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: "draft-8",
  legacyHeaders: false,
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

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  recoveryLimiter,
  validateBody(forgotPasswordSchema),
  forgotPassword,
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  recoveryLimiter,
  validateBody(resetPasswordSchema),
  resetPassword,
);


router.post(
  "/recover-user-id",
  recoveryLimiter,
  validateBody(recoverUserIdSchema),
  recoverUserId,
);

router.post(
  "/recover-email",
  recoveryLimiter,
  validateBody(requestEmailRecoverySchema),
  requestEmailRecovery,
);

router.post(
  "/verify-email-recovery",
  recoveryLimiter,
  validateBody(verifyEmailRecoverySchema),
  verifyEmailRecovery,
);



export default router;
