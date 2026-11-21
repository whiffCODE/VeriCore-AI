
import { Router, type RequestHandler } from "express";

import { validateRequest } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../../middleware/admin.middleware.js";

import {
  otpRequestLimiter,
  otpVerifyLimiter,
} from "../../middleware/otp-rate-limit.middleware.js";

import {
  loginLimiter,
  registrationLimiter,
} from "../../middleware/rate-limit.middleware.js";

import { AppError } from "../../utils/app-error.js";
import { env } from "../../config/env.js";

import {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
} from "./auth.validation.js";

import {
  requestOtpController,
  verifyOtpController,
  loginController,
  currentUserController,
  refreshController,
  logoutController,
  listSessionsController,
  revokeSessionController,
  revokeAllSessionsController,
  registerController,
} from "./auth.controller.js";



const router = Router();

// --------------------------------------------------
// Trusted origin protection
// --------------------------------------------------

const requireTrustedOrigin: RequestHandler = (
  req,
  _res,
  next,
) => {
  const origin = req.get("origin");

  if (origin !== env.FRONTEND_ORIGIN) {
    next(
      new AppError(
        403,
        "Untrusted request origin.",
      ),
    );
    return;
  }

  next();
};

// --------------------------------------------------
// Public OTP routes
// --------------------------------------------------



router.post(
  "/otp/request",
  otpRequestLimiter,
  validateRequest({
    body: otpRequestSchema,
  }),
  requestOtpController,
);

router.post(
  "/otp/verify",
  otpVerifyLimiter,
  validateRequest({
    body: otpVerifySchema,
  }),
  verifyOtpController,
);

// --------------------------------------------------
// Verified registration
// --------------------------------------------------

router.post(
  "/register",
  registrationLimiter,
  validateRequest({
    body: registerSchema,
  }),
  registerController,
);

// --------------------------------------------------
// Public login route
// --------------------------------------------------

router.post(
  "/login",
  loginLimiter,
  validateRequest({
    body: loginSchema,
  }),
  loginController,
);

// --------------------------------------------------
// Protected user routes
// --------------------------------------------------

router.get(
  "/me",
  requireAuth,
  currentUserController,
);

// --------------------------------------------------
// Session management
// --------------------------------------------------

router.get(
  "/sessions",
  requireAuth,
  listSessionsController,
);

router.delete(
  "/sessions/:sessionId",
  requireAuth,
  revokeSessionController,
);

router.delete(
  "/sessions",
  requireAuth,
  revokeAllSessionsController,
);

// --------------------------------------------------
// Refresh and logout
// --------------------------------------------------

router.post(
  "/refresh",
  requireTrustedOrigin,
  refreshController,
);

router.post(
  "/logout",
  requireTrustedOrigin,
  logoutController,
);

// --------------------------------------------------
// Platform administration
// --------------------------------------------------

router.get(
  "/admin/dashboard",
  requireAuth,
  requireSuperAdmin,
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Platform administrator access verified.",
    });
  },
);



export default router;
