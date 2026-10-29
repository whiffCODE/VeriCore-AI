
import mongoose from "mongoose";

import Payment from "../models/payment.model.js";
import { getSubscriptionPlan } from "../config/subscription-plans.js";
import { getStripeClient } from "./stripe.service.js";

const CHECKOUT_LEASE_MS = 30_000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getFrontendBaseUrl() {
  const configured = process.env.FRONTEND_URL || "http://localhost:3000";

  let url;

  try {
    url = new URL(configured);
  } catch {
    throw httpError(503, "FRONTEND_URL is invalid.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw httpError(503, "FRONTEND_URL must be a valid HTTP(S) URL.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw httpError(503, "FRONTEND_URL must use HTTPS in production.");
  }

  return url.origin;
}

function publicSession(payment, session) {
  if (!session.url) {
    throw httpError(
      409,
      "This Checkout Session has no active checkout URL. Start a new payment attempt with a new idempotency key.",
    );
  }

  return {
    paymentId: payment._id.toString(),
    sessionId: session.id,
    checkoutUrl: session.url,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    planId: payment.planId,
    status: payment.status,
  };
}

async function getExistingSession(payment, stripe) {
  if (!payment.providerCheckoutSessionId) return null;

  const session = await stripe.checkout.sessions.retrieve(
    payment.providerCheckoutSessionId,
  );

  if (session.status === "expired") {
    throw httpError(
      409,
      "This Checkout Session has expired. Start a new payment attempt with a new idempotency key.",
    );
  }

  return publicSession(payment, session);
}

export async function createStripeCheckoutSession({
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

  const stripe = getStripeClient();
  const frontendUrl = getFrontendBaseUrl();

  let payment = await Payment.findOne({ userId, idempotencyKey });

  if (payment) {
    if (payment.provider !== "stripe" || payment.planId !== planId) {
      throw httpError(
        409,
        "This idempotency key was already used for a different payment request.",
      );
    }

    if (payment.providerCheckoutSessionId) {
      return await getExistingSession(payment, stripe);
    }
  } else {
    try {
      payment = await Payment.create({
        userId,
        planId: plan.id,
        tier: plan.tier,
        provider: "stripe",
        amountPaise: plan.amountPaise,
        currency: plan.currency,
        idempotencyKey,
        status: "pending",
        checkoutCreationStatus: "not_started",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;

      payment = await Payment.findOne({ userId, idempotencyKey });

      if (!payment) throw error;

      if (payment.provider !== "stripe" || payment.planId !== planId) {
        throw httpError(
          409,
          "This idempotency key was already used for a different payment request.",
        );
      }

      if (payment.providerCheckoutSessionId) {
        return await getExistingSession(payment, stripe);
      }
    }
  }

  if (payment.status !== "pending") {
    throw httpError(409, "This payment is no longer awaiting checkout.");
  }

  const now = new Date();

  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      providerCheckoutSessionId: { $exists: false },
      status: "pending",
      $or: [
        { checkoutCreationStatus: { $in: ["not_started", "failed"] } },
        { checkoutCreationLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        checkoutCreationStatus: "creating",
        checkoutCreationLeaseUntil: new Date(
          now.getTime() + CHECKOUT_LEASE_MS,
        ),
      },
    },
    { new: true },
  );

  if (!claimed) {
    const latest = await Payment.findById(payment._id);

    if (latest?.providerCheckoutSessionId) {
      return await getExistingSession(latest, stripe);
    }

    throw httpError(
      409,
      "Checkout creation is already in progress. Retry shortly with the same Idempotency-Key.",
    );
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",

        line_items: [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              unit_amount: plan.amountPaise,
              product_data: {
                name: `VeriCore AI ${plan.name}`,
                description: `Access for ${plan.durationMonths} month(s).`,
              },
            },
            quantity: 1,
          },
        ],

        client_reference_id: claimed._id.toString(),

        metadata: {
          paymentId: claimed._id.toString(),
          userId: userId.toString(),
          planId: plan.id,
        },

        payment_intent_data: {
          metadata: {
            paymentId: claimed._id.toString(),
            userId: userId.toString(),
            planId: plan.id,
          },
        },

        success_url:
          `${frontendUrl}/billing/success` +
          "?session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          `${frontendUrl}/billing/cancel` +
          `?payment_id=${encodeURIComponent(claimed._id.toString())}`,
      },
      {
        // Stable provider idempotency key protects retries for this DB payment.
        idempotencyKey: `vericore-checkout-${claimed._id.toString()}`,
      },
    );

    const saved = await Payment.findOneAndUpdate(
      {
        _id: claimed._id,
        checkoutCreationStatus: "creating",
      },
      {
        $set: {
          providerCheckoutSessionId: session.id,
          checkoutCreationStatus: "created",
        },
        $unset: {
          checkoutCreationLeaseUntil: 1,
        },
      },
      { new: true },
    );

    if (!saved) {
      throw new Error(
        "Stripe Checkout Session was created but could not be persisted.",
      );
    }

    return publicSession(saved, session);
  } catch (error) {
    await Payment.updateOne(
      {
        _id: claimed._id,
        checkoutCreationStatus: "creating",
        providerCheckoutSessionId: { $exists: false },
      },
      {
        $set: { checkoutCreationStatus: "failed" },
        $unset: { checkoutCreationLeaseUntil: 1 },
      },
    ).catch(() => {});

    throw error;
  }
}
