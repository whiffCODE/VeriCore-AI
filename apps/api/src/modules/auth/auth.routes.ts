
import { Router } from "express";

import { validateRequest } from "../../middleware/validate.middleware.js";

import { requireAuth } from "../../middleware/auth.middleware.js";

import {
  registerSchema,
  loginSchema,
} from "./auth.validation.js";

import {
  registerController,
  loginController,
  currentUserController
} from "./auth.controller.js";

const router = Router();

router.post(
  "/register",
  validateRequest({
    body: registerSchema,
  }),
  registerController,
);

router.post(
  "/login",
  validateRequest({
    body: loginSchema,
  }),
  loginController,
);

router.get(
  "/me",
  requireAuth,
  currentUserController,
);

export default router;
