import express from "express";

import {
  register,
  resendOtp,
  verifyOtp,
  setPassword,
  login,
  refresh,
  logout,
  me,
  forgotPasswordRequest,
  forgotPasswordVerify,
  forgotPasswordReset,
  recoverUserIdController,
  recoverEmailController,
  recoverBothController
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

router.use(authRateLimit);

router.post("/register", register);

router.post(
  "/register/resend-otp",
  resendOtp
);

router.post(
  "/register/verify-otp",
  verifyOtp
);

router.post(
  "/register/set-password",
  setPassword
);

router.post("/login", login);

router.post("/refresh", refresh);

router.post("/logout", logout);

router.get("/me", requireAuth, me);

router.post(
  "/forgot-password/request",
  forgotPasswordRequest
);

router.post(
  "/forgot-password/verify-otp",
  forgotPasswordVerify
);

router.post(
  "/forgot-password/reset",
  forgotPasswordReset
);

router.post(
  "/recover-user-id",
  recoverUserIdController
);

router.post(
  "/recover-email",
  recoverEmailController
);

router.post(
  "/recover-both",
  recoverBothController
);

export default router;