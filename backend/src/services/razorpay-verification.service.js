
import { createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";

import Payment from "../models/payment.model.js";
import { getRazorpayClient } from "./razorpay.service.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function verifyCheckoutSignature(orderId, paymentId, signature, secret) {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`, "utf8")
    .digest();

  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

export async function verifyRazorpayCheckout({
  userId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(401, "Authentication required.");
  }

  if (
    typeof razorpay_order_id !== "string" ||
    typeof razorpay_payment_id !== "string" ||
    typeof razorpay_signature !== "string" ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    razorpay_order_id.length > 100 ||
    razorpay_payment_id.length > 100
  ) {
    throw httpError(400, "Invalid Razorpay verification payload.");
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    throw httpError(503, "Razorpay verification is not configured.");
  }

  // Only verify orders created and stored by our backend for this user.
  const payment = await Payment.findOne({
    userId,
    provider: "razorpay",
    providerOrderId: razorpay_order_id,
  });

  if (!payment) {
    throw httpError(404, "Payment order not found.");
  }

  // Verify the callback signature using the server-stored order ID.
  if (
    !verifyCheckoutSignature(
      payment.providerOrderId,
      razorpay_payment_id,
      razorpay_signature,
      secret,
    )
  ) {
    throw httpError(400, "Razorpay payment signature is invalid.");
  }

  // Idempotent response for a callback already verified successfully.
  if (payment.status === "captured") {
    if (payment.providerPaymentId !== razorpay_payment_id) {
      throw httpError(409, "This order was captured with another payment ID.");
    }

    return {
      paymentId: payment._id.toString(),
      status: "captured",
      alreadyVerified: true,
    };
  }

  if (!["pending", "authorized"].includes(payment.status)) {
    throw httpError(
      409,
      "This payment cannot be verified in its current state.",
    );
  }

  // Verify the payment directly with Razorpay.
  const client = getRazorpayClient();
  let providerPayment;

  try {
    providerPayment = await client.payments.fetch(razorpay_payment_id);
  } catch {
    throw httpError(
      502,
      "Unable to verify the payment with Razorpay. Please retry.",
    );
  }

  if (
    providerPayment.id !== razorpay_payment_id ||
    providerPayment.order_id !== payment.providerOrderId
  ) {
    throw httpError(400, "Razorpay payment does not match this order.");
  }

  if (
    providerPayment.amount !== payment.amountPaise ||
    providerPayment.currency !== payment.currency
  ) {
    throw httpError(400, "Razorpay payment amount or currency does not match.");
  }

  // A failed attempt must not permanently fail the order.
  // A customer may retry checkout using the same order.
  if (providerPayment.status === "failed") {
    await Payment.updateOne(
      {
        _id: payment._id,
        status: { $in: ["pending", "authorized"] },
      },
      {
        $set: {
          failureCode: providerPayment.error_code || "PAYMENT_FAILED",
          failureMessage:
            providerPayment.error_description ||
            "Razorpay reported a failed payment attempt.",
        },
      },
    );

    throw httpError(402, "Razorpay reports that this payment attempt failed.");
  }

  if (providerPayment.status !== "captured") {
    if (providerPayment.status === "authorized") {
      await Payment.updateOne(
        {
          _id: payment._id,
          status: "pending",
          $or: [
            { providerPaymentId: { $exists: false } },
            { providerPaymentId: razorpay_payment_id },
          ],
        },
        {
          $set: {
            status: "authorized",
            providerPaymentId: razorpay_payment_id,
          },
        },
      );
    }

    throw httpError(
      409,
      "Payment is not captured yet. Access has not been activated.",
    );
  }

  // Atomically mark this payment as captured.
  let updated;

  try {
    updated = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: { $in: ["pending", "authorized"] },
        $or: [
          { providerPaymentId: { $exists: false } },
          { providerPaymentId: razorpay_payment_id },
        ],
      },
      {
        $set: {
          status: "captured",
          providerPaymentId: razorpay_payment_id,
          paidAt: new Date(),
        },
        $unset: {
          failureCode: 1,
          failureMessage: 1,
        },
      },
      { new: true },
    );
  } catch (error) {
    if (error?.code === 11000) {
      throw httpError(409, "This Razorpay payment ID has already been used.");
    }

    throw error;
  }

  if (!updated) {
    // A concurrent callback may have completed the update first.
    const latest = await Payment.findById(payment._id);

    if (
      latest?.status === "captured" &&
      latest.providerPaymentId === razorpay_payment_id
    ) {
      return {
        paymentId: latest._id.toString(),
        status: "captured",
        alreadyVerified: true,
      };
    }

    throw httpError(
      409,
      "Payment state changed. Please check payment history.",
    );
  }

  return {
    paymentId: updated._id.toString(),
    status: "captured",
    alreadyVerified: false,
  };
}
