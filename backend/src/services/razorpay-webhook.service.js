
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import Payment from "../models/payment.model.js";
import WebhookEvent from "../models/webhook-event.model.js";
import { activateSubscriptionForPayment } from "./subscription-lifecycle.service.js";

const LEASE_MS = 30_000;
const MAX_PAYLOAD_BYTES = 1_000_000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function verifySignature(rawBody, signature, secret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !secret
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

async function claimEvent({ eventId, payloadHash, eventType }) {
  const now = new Date();

  try {
    const event = await WebhookEvent.create({
      provider: "razorpay",
      eventId,
      eventType,
      payloadHash,
      status: "processing",
      attempts: 1,
      receivedAt: now,
      processingStartedAt: now,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
    });

    return {
      duplicate: false,
      busy: false,
      event,
    };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }

  const existing = await WebhookEvent.findOne({
    provider: "razorpay",
    eventId,
  });

  if (!existing) {
    throw httpError(
      503,
      "Could not read the webhook event record.",
    );
  }

  if (existing.payloadHash !== payloadHash) {
    throw httpError(
      409,
      "This webhook event ID was received with a different payload.",
    );
  }

  if (existing.status === "processed") {
    return {
      duplicate: true,
      busy: false,
      event: existing,
    };
  }

  if (
    existing.status === "processing" &&
    existing.leaseUntil &&
    existing.leaseUntil > now
  ) {
    return {
      duplicate: false,
      busy: true,
      event: existing,
    };
  }

  // Recover failed or abandoned processing attempts.
  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      _id: existing._id,
      status: { $in: ["failed", "received", "processing"] },
      payloadHash,
      $or: [
        { status: { $in: ["failed", "received"] } },
        {
          status: "processing",
          leaseUntil: { $lte: now },
        },
        {
          status: "processing",
          leaseUntil: { $exists: false },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        processingStartedAt: now,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
      },
      $inc: {
        attempts: 1,
      },
      $unset: {
        lastError: 1,
      },
    },
    { new: true },
  );

  if (!reclaimed) {
    return {
      duplicate: false,
      busy: true,
      event: existing,
    };
  }

  return {
    duplicate: false,
    busy: false,
    event: reclaimed,
  };
}

async function activateCapturedPayment(paymentId) {
  const activation = await activateSubscriptionForPayment(paymentId);

  return {
    outcome: "payment_captured",
    subscription: activation,
  };
}

async function applyPaymentEvent(eventType, eventBody) {
  const entity = eventBody?.payload?.payment?.entity;

  if (!entity || typeof entity.id !== "string") {
    throw httpError(400, "Webhook payment entity is missing.");
  }

  const orderId = entity.order_id;
  const paymentId = entity.id;

  if (typeof orderId !== "string" || !orderId) {
    throw httpError(400, "Webhook order ID is missing.");
  }

  const payment = await Payment.findOne({
    provider: "razorpay",
    providerOrderId: orderId,
  });

  // Ignore payments that do not belong to this application.
  if (!payment) {
    return {
      outcome: "ignored_unmatched_order",
    };
  }

  if (
    entity.amount !== payment.amountPaise ||
    entity.currency !== payment.currency
  ) {
    throw httpError(
      409,
      "Webhook amount or currency does not match the order.",
    );
  }

  if (eventType === "payment.captured") {
    try {
      const updated = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: {
            $in: ["pending", "authorized", "captured"],
          },
          $or: [
            { providerPaymentId: { $exists: false } },
            { providerPaymentId: paymentId },
          ],
        },
        {
          $set: {
            status: "captured",
            providerPaymentId: paymentId,
            paidAt: payment.paidAt ?? new Date(),
          },
          $unset: {
            failureCode: 1,
            failureMessage: 1,
          },
        },
        { new: true },
      );

      if (updated) {
        return activateCapturedPayment(updated._id);
      }
    } catch (error) {
      if (error?.code === 11000) {
        throw httpError(
          409,
          "Payment ID is already associated with another payment.",
        );
      }

      throw error;
    }

    // Handle a previously captured payment idempotently.
    const latest = await Payment.findById(payment._id);

    if (
      latest?.status === "captured" &&
      latest.providerPaymentId === paymentId
    ) {
      return activateCapturedPayment(latest._id);
    }

    throw httpError(
      409,
      "Payment state changed; reconciliation is required.",
    );
  }

  if (eventType === "payment.authorized") {
    if (payment.status === "captured") {
      if (payment.providerPaymentId === paymentId) {
        return {
          outcome: "already_captured",
        };
      }

      throw httpError(
        409,
        "Authorization conflicts with an existing captured payment.",
      );
    }

    const updated = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: "pending",
        $or: [
          { providerPaymentId: { $exists: false } },
          { providerPaymentId: paymentId },
        ],
      },
      {
        $set: {
          status: "authorized",
          providerPaymentId: paymentId,
        },
      },
      { new: true },
    );

    if (!updated) {
      const latest = await Payment.findById(payment._id);

      if (
        latest?.status === "authorized" &&
        latest.providerPaymentId === paymentId
      ) {
        return {
          outcome: "already_authorized",
        };
      }

      throw httpError(
        409,
        "Payment authorization conflicts with current state.",
      );
    }

    return {
      outcome: "payment_authorized",
    };
  }

  if (eventType === "payment.failed") {
    if (payment.status === "captured") {
      return {
        outcome: "already_captured",
      };
    }

    await Payment.updateOne(
      {
        _id: payment._id,
        status: {
          $in: ["pending", "authorized"],
        },
      },
      {
        $set: {
          failureCode: entity.error_code || "PAYMENT_FAILED",
          failureMessage:
            entity.error_description ||
            "Razorpay reported a failed attempt.",
        },
      },
    );

    return {
      outcome: "payment_attempt_failed",
    };
  }

  return {
    outcome: "ignored_event_type",
  };
}

export async function handleRazorpayWebhook({
  rawBody,
  signature,
  eventId,
}) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw httpError(
      503,
      "Razorpay webhook secret is not configured.",
    );
  }

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw httpError(
      400,
      "Webhook raw request body is missing.",
    );
  }

  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    throw httpError(
      413,
      "Webhook payload is too large.",
    );
  }

  if (!verifySignature(rawBody, signature, secret)) {
    throw httpError(
      400,
      "Invalid Razorpay webhook signature.",
    );
  }

  if (
    typeof eventId !== "string" ||
    eventId.length < 1 ||
    eventId.length > 255
  ) {
    throw httpError(
      400,
      "Razorpay event ID is missing or invalid.",
    );
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw httpError(
      400,
      "Webhook payload is not valid JSON.",
    );
  }

  if (
    typeof payload?.event !== "string" ||
    !payload.event
  ) {
    throw httpError(
      400,
      "Webhook event type is missing.",
    );
  }

  const payloadHash = createHash("sha256")
    .update(rawBody)
    .digest("hex");

  const claim = await claimEvent({
    eventId,
    payloadHash,
    eventType: payload.event,
  });

  if (claim.duplicate) {
    return {
      received: true,
      duplicate: true,
      eventId,
    };
  }

  // Do not acknowledge an event another request is processing.
  // Razorpay can retry after this temporary failure.
  if (claim.busy) {
    throw httpError(
      503,
      "Webhook event is currently being processed. Retry later.",
    );
  }

  try {
    const result = await applyPaymentEvent(
      payload.event,
      payload,
    );

    const completed = await WebhookEvent.updateOne(
      {
        _id: claim.event._id,
        status: "processing",
        leaseUntil: claim.event.leaseUntil,
      },
      {
        $set: {
          status: "processed",
          processedAt: new Date(),
        },
        $unset: {
          leaseUntil: 1,
          lastError: 1,
        },
      },
    );

    if (completed.modifiedCount !== 1) {
      throw httpError(
        503,
        "Webhook processing lease was lost before completion.",
      );
    }

    return {
      received: true,
      duplicate: false,
      eventId,
      outcome: result.outcome,
      subscription: result.subscription,
    };
  } catch (error) {
    await WebhookEvent.updateOne(
      {
        _id: claim.event._id,
        status: "processing",
        leaseUntil: claim.event.leaseUntil,
      },
      {
        $set: {
          status: "failed",
          lastError: String(
            error.message || "Webhook processing failed",
          ).slice(0, 1000),
        },
        $unset: {
          leaseUntil: 1,
        },
      },
    ).catch(() => {});

    throw error;
  }
}
