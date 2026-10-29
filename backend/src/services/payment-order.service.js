
import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import { getSubscriptionPlan } from "../config/subscription-plans.js";
import { getRazorpayClient } from "./razorpay.service.js";

const ORDER_CREATION_LEASE_MS = 30_000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function publicOrder(payment, keyId) {
  return {
    paymentId: payment._id.toString(),
    orderId: payment.providerOrderId,
    keyId,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    planId: payment.planId,
    status: payment.status,
  };
}

export async function createRazorpayOrder({
  userId,
  planId,
  idempotencyKey,
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(401, "A valid authenticated user is required.");
  }

  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    throw httpError(400, "A valid Idempotency-Key header is required.");
  }

  const plan = getSubscriptionPlan(planId);

  if (!plan || !["pro", "enterprise"].includes(plan.tier)) {
    throw httpError(400, "The selected subscription plan is invalid.");
  }

  // Validate configuration before reserving a database record.
  const client = getRazorpayClient();
  const keyId = process.env.RAZORPAY_KEY_ID;

  let payment = await Payment.findOne({ userId, idempotencyKey });

  if (payment) {
    if (payment.provider !== "razorpay" || payment.planId !== planId) {
      throw httpError(
        409,
        "This idempotency key was already used for a different payment request.",
      );
    }

    if (payment.providerOrderId) {
      return publicOrder(payment, keyId);
    }
  } else {
    try {
      payment = await Payment.create({
        userId,
        planId: plan.id,
        tier: plan.tier,
        provider: "razorpay",
        amountPaise: plan.amountPaise,
        currency: plan.currency,
        idempotencyKey,
        status: "pending",
        orderCreationStatus: "not_started",
      });
    } catch (error) {
      // Another request may have inserted the same user/key concurrently.
      if (error?.code !== 11000) throw error;

      payment = await Payment.findOne({ userId, idempotencyKey });

      if (!payment) throw error;

      if (payment.provider !== "razorpay" || payment.planId !== planId) {
        throw httpError(
          409,
          "This idempotency key was already used for a different payment request.",
        );
      }

      if (payment.providerOrderId) {
        return publicOrder(payment, keyId);
      }
    }
  }

  if (payment.status !== "pending") {
    throw httpError(409, "This payment is no longer awaiting checkout.");
  }

  const now = new Date();
  const leaseUntil = new Date(now.getTime() + ORDER_CREATION_LEASE_MS);

  // Only one request may own the active order-creation lease.
  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      providerOrderId: { $exists: false },
      status: "pending",
      $or: [
        { orderCreationStatus: { $in: ["not_started", "failed"] } },
        { orderCreationLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        orderCreationStatus: "creating",
        orderCreationLeaseUntil: leaseUntil,
      },
    },
    { new: true },
  );

  if (!claimed) {
    const latest = await Payment.findById(payment._id);

    if (latest?.providerOrderId) {
      return publicOrder(latest, keyId);
    }

    throw httpError(
      409,
      "Order creation is already in progress. Retry with the same Idempotency-Key shortly.",
    );
  }

  try {
    const order = await client.orders.create({
      amount: plan.amountPaise,
      currency: plan.currency,
      receipt: claimed._id.toString(),
      partial_payment: false,
      notes: {
        payment_id: claimed._id.toString(),
        user_id: userId.toString(),
        plan_id: plan.id,
      },
    });

    const saved = await Payment.findOneAndUpdate(
      {
        _id: claimed._id,
        orderCreationStatus: "creating",
      },
      {
        $set: {
          providerOrderId: order.id,
          orderCreationStatus: "created",
        },
        $unset: {
          orderCreationLeaseUntil: 1,
        },
      },
      { new: true },
    );

    if (!saved) {
      // Do not claim success when the provider order was not persisted.
      throw new Error("Razorpay order was created but could not be persisted.");
    }

    return publicOrder(saved, keyId);
  } catch (error) {
    await Payment.updateOne(
      {
        _id: claimed._id,
        orderCreationStatus: "creating",
        providerOrderId: { $exists: false },
      },
      {
        $set: { orderCreationStatus: "failed" },
        $unset: { orderCreationLeaseUntil: 1 },
      },
    ).catch(() => {});

    throw error;
  }
}
