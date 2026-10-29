
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createRazorpayOrderController,
} from "../controllers/billing.controller.js";
import {
  verifyRazorpayCheckoutController,
} from "../controllers/billing.controller.js";
import {
  razorpayWebhookController,
} from "../controllers/billing.controller.js";

import {
  createStripeCheckoutSessionController,
} from "../controllers/billing.controller.js";

const router = Router();

router.post(
  "/razorpay/orders",
  requireAuth,
  createRazorpayOrderController,
);

router.post(
  "/razorpay/verify",
  requireAuth,
  verifyRazorpayCheckoutController,
);

router.post(
  "/webhooks/razorpay",
  razorpayWebhookController,
);

router.post(
  "/stripe/checkout-session",
  requireAuth,
  createStripeCheckoutSessionController,
);

export default router;
