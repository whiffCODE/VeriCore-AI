
import { Router, type RequestHandler } from "express";

import { validateRequest } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

import { AppError } from "../../utils/app-error.js";
import { env } from "../../config/env.js";

import {
  registerSchema,
  loginSchema,
} from "./auth.validation.js";

import {
  registerController,
  loginController,
  currentUserController,
  refreshController,
  logoutController,
} from "./auth.controller.js";

const router = Router();

// Verify the origin of cookie-based authentication requests.
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

// Public registration endpoint.
router.post(
  "/register",
  validateRequest({
    body: registerSchema,
  }),
  registerController,
);

// Public login endpoint.
router.post(
  "/login",
  validateRequest({
    body: loginSchema,
  }),
  loginController,
);

// Protected current-user endpoint.
router.get(
  "/me",
  requireAuth,
  currentUserController,
);

// Refresh access token and rotate refresh token.
router.post(
  "/refresh",
  requireTrustedOrigin,
  refreshController,
);

// Revoke the current refresh-token session.
router.post(
  "/logout",
  requireTrustedOrigin,
  logoutController,
);

export default router;
