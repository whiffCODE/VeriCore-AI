
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createRazorpayOrderController,
  verifyRazorpayCheckoutController,
  razorpayWebhookController,
  createStripeCheckoutSessionController,
  stripeWebhookController,
  getPaymentHistoryController,
  getPaymentReceiptController,
  createPaymentReceiptController,
  downloadPaymentReceiptController
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

router.post(
  "/webhooks/stripe",
  stripeWebhookController,
);

router.get(
  "/payments",
  requireAuth,
  getPaymentHistoryController
);

router.post(
  "/payments/:paymentId/receipt",
  requireAuth,
  createPaymentReceiptController
);

router.get(
  "/receipts/:receiptId",
  requireAuth,
  getPaymentReceiptController
);

router.get(
  "/receipts/:receiptId/download",
  requireAuth,
  downloadPaymentReceiptController
);

export default router;
