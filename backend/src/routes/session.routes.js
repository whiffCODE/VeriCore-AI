
import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  currentSession,
  login,
  logout,
  logoutAll,
  refresh,
} from "../controllers/session.controller.js";

import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate-body.js";
import { loginSchema } from "../validators/auth.validators.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  login,
);

router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", requireAuth, logoutAll);
router.get("/me", requireAuth, currentSession);

export default router;
