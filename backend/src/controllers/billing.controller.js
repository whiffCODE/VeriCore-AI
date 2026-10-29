
import { createRazorpayOrder } from "../services/payment-order.service.js";

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
