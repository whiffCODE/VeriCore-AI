
import { Router } from "express";

import { validateRequest } from "../../middleware/validate.middleware.js";

import {
  registerSchema,
  loginSchema,
} from "./auth.validation.js";

import {
  registerController,
  loginController,
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

export default router;
