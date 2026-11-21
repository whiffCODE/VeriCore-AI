
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../../middleware/admin.middleware.js";

import { adminController } from "./admin.controller.js";

// --------------------------------------------------
// Platform Admin Routes
// --------------------------------------------------

const router = Router();

// All routes in this module require authentication
// and Platform Super Admin authorization.

router.use(
  requireAuth,
  requireSuperAdmin,
);

// --------------------------------------------------
// Dashboard
// --------------------------------------------------

router.get(
  "/dashboard",
  adminController.getDashboard,
);

// --------------------------------------------------
// Export
// --------------------------------------------------

export default router;
