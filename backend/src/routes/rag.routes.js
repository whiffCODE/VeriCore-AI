
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate-body.js";
import { askQuestionSchema } from "../validators/rag.validators.js";
import { retrieveForQuestion } from "../controllers/rag.controller.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/retrieve",
  validateBody(askQuestionSchema),
  retrieveForQuestion,
);

export default router;
