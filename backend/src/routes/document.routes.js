
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  uploadPdf,
  verifyPdfSignature,
} from "../middleware/upload-pdf.js";

import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  reindexDocument,
} from "../controllers/document.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listDocuments);
router.post("/", uploadPdf.single("file"), verifyPdfSignature, uploadDocument);
router.post("/:documentId/reindex", reindexDocument);
router.get("/:documentId", getDocument);
router.delete("/:documentId", deleteDocument);

export default router;
