
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { validateBody } from "../middleware/validate-body.js";

import {
  listUsers,
  changeUserStatus,
  changeUserRole,
} from "../controllers/admin.controller.js";

import {
  adminStatusChangeSchema,
  adminRoleChangeSchema,
} from "../validators/auth.validators.js";

const router = Router();

// Every endpoint in this router requires both authentication
// and the admin role.
router.use(requireAuth, requireAdmin);

router.get("/users", listUsers);

router.patch(
  "/users/:id/status",
  validateBody(adminStatusChangeSchema),
  changeUserStatus,
);

router.patch(
  "/users/:id/role",
  validateBody(adminRoleChangeSchema),
  changeUserRole,
);

export default router;
