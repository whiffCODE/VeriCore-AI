
import { createRazorpayOrder } from "../services/payment-order.service.js";
import {
  verifyRazorpayCheckout,
} from "../services/razorpay-verification.service.js";
import {
  handleRazorpayWebhook,
} from "../services/razorpay-webhook.service.js";
import {
  createStripeCheckoutSession,
} from "../services/stripe-checkout.service.js";
import {
  handleStripeWebhook,
} from "../services/stripe-webhook.service.js";

import {
  getPaymentHistory,
} from "../services/payment-history.service.js";
import {
  createReceiptForPayment,
} from "../services/receipt.service.js";

import {
  createReceiptPdf
} from "../services/receipt-pdf.service.js";

import {
  Receipt
} from "../models/receipt.model.js";

import Receipt from "../models/receipt.model.js";
import Payment from "../models/payment.model.js";

function getAuthenticatedUserId(req) {
  const userId =
    req.user?.userId ??
    req.user?.id ??
    req.user?._id ??
    req.auth?.userId;

  return userId?.toString() ?? null;
}

export async function createRazorpayOrderController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

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
      userId,
      planId: planId.trim(),
      idempotencyKey: req.get("Idempotency-Key"),
    });

    return res.status(201).json({
      data: order,
    });
  } catch (error) {
    return next(error);
  }
}

export async function verifyRazorpayCheckoutController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await verifyRazorpayCheckout({
      userId,
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

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createStripeCheckoutSessionController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

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

    const session = await createStripeCheckoutSession({
      userId,
      planId: planId.trim(),
      idempotencyKey: req.get("Idempotency-Key"),
    });

    return res.status(201).json({
      data: session,
    });
  } catch (error) {
    return next(error);
  }
}

export async function stripeWebhookController(req, res, next) {
  try {
    const result = await handleStripeWebhook({
      rawBody: req.rawBody,
      signature: req.get("stripe-signature"),
    });

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPaymentHistoryController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await getPaymentHistory({
      userId,
      limit: req.query.limit,
      cursor: req.query.cursor,
      status: req.query.status,
      provider: req.query.provider,
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPaymentReceiptController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const receipt = await Receipt.findOne({
      _id: req.params.receiptId,
      userId,
    }).lean();

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createPaymentReceiptController(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    // Check ownership before attempting to create a receipt.
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      userId,
    }).select("_id");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const receipt = await createReceiptForPayment(payment._id);

    return res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    return next(error);
  }
}

export async function downloadPaymentReceiptController(req, res, next) {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.receiptId,
      userId: req.user._id,
    }).lean();

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    const filename = `${receipt.receiptNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const pdf = createReceiptPdf(receipt);

    pdf.on("error", (error) => {
      if (!res.headersSent) {
        next(error);
      } else {
        res.destroy(error);
      }
    });

    pdf.pipe(res);
  } catch (error) {
    return next(error);
  }
}
