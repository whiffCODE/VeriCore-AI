
import { createRazorpayOrder } from "../services/payment-order.service.js";
import {
  verifyRazorpayCheckout,
} from "../services/razorpay-verification.service.js";

import {
  handleRazorpayWebhook,
} from "../services/razorpay-webhook.service.js";

export async function createRazorpayOrderController(req, res, next) {
  try {
    // Identity must come from your existing authentication middleware.
    const userId =
      req.user?.userId ??
      req.user?.id ??
      req.user?._id ??
      req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const { planId } = req.body ?? {};

    if (typeof planId !== "string" || !planId.trim()) {
      return res.status(400).json({
        error: "planId is required.",
      });
    }

    const order = await createRazorpayOrder({
      userId: userId.toString(),
      planId: planId.trim(),
      idempotencyKey: req.get("Idempotency-Key"),
    });

    return res.status(201).json({ data: order });
  } catch (error) {
    return next(error);
  }
}



export async function verifyRazorpayCheckoutController(req, res, next) {
  try {
    const userId =
      req.user?.userId ??
      req.user?.id ??
      req.user?._id ??
      req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await verifyRazorpayCheckout({
      userId: userId.toString(),
      razorpay_order_id: req.body?.razorpay_order_id,
      razorpay_payment_id: req.body?.razorpay_payment_id,
      razorpay_signature: req.body?.razorpay_signature,
    });

    return res.status(200).json({
      message: "Payment verified with Razorpay.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}


export async function razorpayWebhookController(req, res, next) {
  try {
    const result = await handleRazorpayWebhook({
      rawBody: req.rawBody,
      signature: req.get("X-Razorpay-Signature"),
      eventId: req.get("x-razorpay-event-id"),
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
}