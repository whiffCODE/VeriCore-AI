
import { createHash } from "node:crypto";

import Payment from "../models/payment.model.js";
import WebhookEvent from "../models/webhook-event.model.js";
import { getStripeClient } from "./stripe.service.js";

const LEASE_MS = 30_000;
const MAX_PAYLOAD_BYTES = 1_000_000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function claimEvent({ eventId, eventType, payloadHash }) {
  const now = new Date();

  try {
    const event = await WebhookEvent.create({
      provider: "stripe",
      eventId,
      eventType,
      payloadHash,
      status: "processing",
      attempts: 1,
      receivedAt: now,
      processingStartedAt: now,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
    });

    return { duplicate: false, event };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const existing = await WebhookEvent.findOne({
    provider: "stripe",
    eventId,
  });

  if (!existing) {
    throw httpError(503, "Could not read the Stripe webhook event record.");
  }

  if (existing.payloadHash !== payloadHash) {
    throw httpError(
      409,
      "This Stripe event ID was received with a different payload.",
    );
  }

  if (existing.status === "processed") {
    return { duplicate: true, event: existing };
  }

  if (
    existing.status === "processing" &&
    existing.leaseUntil &&
    existing.leaseUntil > now
  ) {
    return { busy: true, event: existing };
  }

  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      _id: existing._id,
      payloadHash,
      $or: [
        { status: "failed" },
        { status: "received" },
        { status: "processing", leaseUntil: { $lte: now } },
        { status: "processing", leaseUntil: { $exists: false } },
      ],
    },
    {
      $set: {
        status: "processing",
        processingStartedAt: now,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
      },
      $inc: { attempts: 1 },
      $unset: { lastError: 1 },
    },
    { new: true },
  );

  if (!reclaimed) {
    return { busy: true, event: existing };
  }

  return { duplicate: false, event: reclaimed };
}

async function reconcileCheckoutSession(sessionId, eventType) {
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    throw httpError(400, "Invalid Stripe Checkout Session ID.");
  }

  const stripe = getStripeClient();

  let session;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    throw httpError(
      502,
      "Unable to retrieve the Checkout Session from Stripe.",
    );
  }

  if (session.id !== sessionId || session.mode !== "payment") {
    throw httpError(
      400,
      "Stripe Checkout Session does not match this payment flow.",
    );
  }

  const paymentId = session.metadata?.paymentId;
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (
    typeof paymentId !== "string" ||
    typeof userId !== "string" ||
    typeof planId !== "string"
  ) {
    throw httpError(400, "Stripe Checkout Session metadata is incomplete.");
  }

  const payment = await Payment.findOne({
    _id: paymentId,
    userId,
    planId,
    provider: "stripe",
    providerCheckoutSessionId: sessionId,
  });

  if (!payment) {
    return { outcome: "ignored_unmatched_session" };
  }

  if (
    session.client_reference_id !== payment._id.toString() ||
    session.amount_total !== payment.amountPaise ||
    session.currency?.toUpperCase() !== payment.currency
  ) {
    throw httpError(
      409,
      "Stripe Checkout Session does not match the stored payment.",
    );
  }

  if (session.payment_status !== "paid") {
    if (eventType === "checkout.session.async_payment_failed") {
      await Payment.updateOne(
        {
          _id: payment._id,
          status: { $in: ["pending", "authorized"] },
        },
        {
          $set: {
            failureCode: "STRIPE_ASYNC_PAYMENT_FAILED",
            failureMessage:
              "Stripe reported that the asynchronous payment failed.",
          },
        },
      );

      return { outcome: "async_payment_failed" };
    }

    return { outcome: "awaiting_payment" };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (
    typeof paymentIntentId !== "string" ||
    !paymentIntentId.startsWith("pi_")
  ) {
    throw httpError(
      409,
      "Paid Checkout Session has no valid PaymentIntent.",
    );
  }

  if (payment.status === "captured") {
    if (payment.providerPaymentId !== paymentIntentId) {
      throw httpError(
        409,
        "Captured payment is associated with another PaymentIntent.",
      );
    }

    return { outcome: "already_captured" };
  }

  if (!["pending", "authorized"].includes(payment.status)) {
    throw httpError(409, "Payment is not eligible for capture.");
  }

  let updated;

  try {
    updated = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: { $in: ["pending", "authorized"] },
        $or: [
          { providerPaymentId: { $exists: false } },
          { providerPaymentId: paymentIntentId },
        ],
      },
      {
        $set: {
          status: "captured",
          providerPaymentId: paymentIntentId,
          paidAt: payment.paidAt ?? new Date(),
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
      throw httpError(
        409,
        "PaymentIntent is already associated with another payment.",
      );
    }

    throw error;
  }

  if (updated) {
    return { outcome: "payment_captured" };
  }

  const latest = await Payment.findById(payment._id);

  if (
    latest?.status === "captured" &&
    latest.providerPaymentId === paymentIntentId
  ) {
    return { outcome: "already_captured" };
  }

  throw httpError(
    409,
    "Payment state changed; reconciliation is required.",
  );
}

async function processEvent(event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      return reconcileCheckoutSession(
        event.data?.object?.id,
        event.type,
      );
    }

    default:
      return { outcome: "ignored_event_type" };
  }
}

export async function handleStripeWebhook({ rawBody, signature }) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw httpError(503, "Stripe webhook secret is not configured.");
  }

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw httpError(400, "Stripe webhook raw request body is missing.");
  }

  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    throw httpError(413, "Stripe webhook payload is too large.");
  }

  if (typeof signature !== "string" || signature.length > 4096) {
    throw httpError(400, "Stripe-Signature header is missing or invalid.");
  }

  const stripe = getStripeClient();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    );
  } catch {
    throw httpError(400, "Invalid Stripe webhook signature.");
  }

  if (
    typeof event.id !== "string" ||
    !event.id.startsWith("evt_") ||
    typeof event.type !== "string"
  ) {
    throw httpError(400, "Stripe event identity is invalid.");
  }

  const payloadHash = createHash("sha256")
    .update(rawBody)
    .digest("hex");

  const claim = await claimEvent({
    eventId: event.id,
    eventType: event.type,
    payloadHash,
  });

  if (claim.busy) {
    throw httpError(
      503,
      "This Stripe event is already being processed. Retry shortly.",
    );
  }

  if (claim.duplicate) {
    return {
      received: true,
      duplicate: true,
      eventId: event.id,
    };
  }

  try {
    const result = await processEvent(event);

    await WebhookEvent.updateOne(
      { _id: claim.event._id, status: "processing" },
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

    return {
      received: true,
      duplicate: false,
      eventId: event.id,
      outcome: result.outcome,
    };
  } catch (error) {
    await WebhookEvent.updateOne(
      { _id: claim.event._id, status: "processing" },
      {
        $set: {
          status: "failed",
          lastError: String(
            error.message || "Stripe webhook processing failed",
          ).slice(0, 1000),
        },
        $unset: { leaseUntil: 1 },
      },
    ).catch(() => {});

    throw error;
  }
}
