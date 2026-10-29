
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createRazorpayOrderController,
} from "../controllers/billing.controller.js";

const router = Router();

router.post(
  "/razorpay/orders",
  requireAuth,
  createRazorpayOrderController,
);

export default router;
