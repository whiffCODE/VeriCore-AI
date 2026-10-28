
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate-body.js";

import {
  getAccount,
  requestAccountDeletion,
  confirmAccountDeletion,
} from "../controllers/account.controller.js";

import {
  accountDeletionRequestSchema,
  accountDeletionConfirmSchema,
} from "../validators/auth.validators.js";

const router = Router();

router.use(requireAuth);

// GET /api/account
router.get("/", getAccount);

//POST /api/account/deletion/request
router.post(
  "/deletion/request",
  validateBody(accountDeletionRequestSchema),
  requestAccountDeletion,
);

//POST /api/account/deletion/confirm
router.post(
  "/deletion/confirm",
  validateBody(accountDeletionConfirmSchema),
  confirmAccountDeletion,
);

export default router;
