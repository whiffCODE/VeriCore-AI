
import mongoose from "mongoose";

import Payment from "../models/payment.model.js";
import Subscription from "../models/subscription.model.js";
import User from "../models/user.model.js";
import { getSubscriptionPlan } from "../config/subscription-plans.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Add calendar months without allowing dates such as January 31
 * to roll unexpectedly into March.
 *
 * Example:
 * January 31 + 1 month = February 28/29.
 */
function addMonthsClamped(date, months) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  result.setUTCDate(Math.min(originalDay, lastDay));

  return result;
}

function userSubscriptionSummary(subscription) {
  return {
    plan: subscription.tier,
    status: "active",
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt,
  };
}

async function syncUserSubscription(userId, subscription, session) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        subscription: userSubscriptionSummary(subscription),
      },
    },
    { session },
  );
}

/**
 * Activate a subscription after a payment has been verified.
 *
 * Important:
 * This function must only be called after Razorpay or Stripe
 * payment verification has succeeded.
 */
export async function activateSubscriptionForPayment(paymentId) {
  if (!mongoose.isValidObjectId(paymentId)) {
    throw httpError(400, "Invalid payment ID.");
  }

  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(session);

      if (!payment) {
        throw httpError(404, "Payment not found.");
      }

      if (
        payment.status !== "captured" ||
        !payment.providerPaymentId
      ) {
        throw httpError(
          409,
          "Only a verified captured payment can activate a subscription.",
        );
      }

      if (!["razorpay", "stripe"].includes(payment.provider)) {
        throw httpError(400, "Unsupported payment provider.");
      }

      const plan = getSubscriptionPlan(payment.planId);

      if (
        !plan ||
        plan.tier !== payment.tier ||
        plan.amountPaise !== payment.amountPaise ||
        plan.currency !== payment.currency
      ) {
        throw httpError(
          409,
          "The stored payment does not match the server-side subscription plan.",
        );
      }

      const user = await User.findById(payment.userId).session(session);

      if (!user) {
        throw httpError(404, "Payment owner no longer exists.");
      }

      // Idempotent replay: the checkout verification endpoint and
      // webhook may both attempt to activate the same payment.
      const existing = await Subscription.findOne({
        paymentId: payment._id,
      }).session(session);

      if (existing) {
        // Repair the payment reference if it is missing.
        if (!payment.subscriptionId) {
          await Payment.updateOne(
            { _id: payment._id },
            {
              $set: {
                subscriptionId: existing._id,
              },
            },
            { session },
          );
        }

        const now = new Date();

        if (
          existing.status === "active" &&
          existing.startsAt <= now &&
          existing.endsAt > now
        ) {
          await syncUserSubscription(
            user._id,
            existing,
            session,
          );
        }

        result = {
          subscriptionId: existing._id.toString(),
          status: existing.status,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          alreadyActivated: true,
        };

        return;
      }

      /*
       * Serialize concurrent subscription activations for the same
       * user by writing to the user document inside this transaction.
       *
       * The __billingRevision field must exist in the User schema.
       */
      await User.updateOne(
        { _id: user._id },
        {
          $inc: {
            __billingRevision: 1,
          },
        },
        { session },
      );

      const now = new Date();

      const latest = await Subscription.findOne({
        userId: user._id,
        status: {
          $in: ["active", "pending"],
        },
        endsAt: {
          $gt: now,
        },
      })
        .sort({ endsAt: -1 })
        .session(session);

      const startsAt =
        latest && latest.endsAt > now
          ? new Date(latest.endsAt)
          : now;

      const endsAt = addMonthsClamped(
        startsAt,
        plan.durationMonths,
      );

      const status =
        startsAt > now ? "pending" : "active";

      const [created] = await Subscription.create(
        [
          {
            userId: user._id,
            paymentId: payment._id,
            planId: plan.id,
            tier: plan.tier,
            status,
            startsAt,
            endsAt,
            autoRenew: false,
            provider: payment.provider,
            renewalOf: latest?._id,
          },
        ],
        { session },
      );

      await Payment.updateOne(
        {
          _id: payment._id,
          status: "captured",
        },
        {
          $set: {
            subscriptionId: created._id,
          },
        },
        { session },
      );

      // Only an immediately active subscription updates the
      // user's current subscription summary.
      if (status === "active") {
        await syncUserSubscription(
          user._id,
          created,
          session,
        );
      }

      result = {
        subscriptionId: created._id.toString(),
        status: created.status,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        alreadyActivated: false,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Process expired subscriptions and activate queued renewals.
 *
 * Run this periodically from a background worker.
 *
 * The worker:
 * 1. Finds users with expired or due subscriptions.
 * 2. Marks expired subscriptions as expired.
 * 3. Activates the next eligible queued subscription.
 * 4. Synchronizes the user's current subscription summary.
 * 5. Downgrades users to the free tier when no active plan remains.
 */
export async function processSubscriptionExpiries({
  now = new Date(),
  limit = 500,
} = {}) {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new TypeError("now must be a valid Date.");
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 5000
  ) {
    throw new RangeError(
      "limit must be an integer between 1 and 5000.",
    );
  }

  const due = await Subscription.find({
    $or: [
      {
        status: "active",
        endsAt: { $lte: now },
      },
      {
        status: "pending",
        startsAt: { $lte: now },
        endsAt: { $gt: now },
      },
    ],
  })
    .select("userId")
    .limit(limit)
    .lean();

  const userIds = [
    ...new Set(
      due.map((item) => item.userId.toString()),
    ),
  ];

  let expiredCount = 0;
  let activatedCount = 0;

  for (const userId of userIds) {
    const session = await mongoose.startSession();

    // Keep counters local to this transaction callback.
    // MongoDB can retry the callback, so global counters must
    // only be updated after withTransaction succeeds.
    let transactionExpiredCount = 0;
    let transactionActivatedCount = 0;

    try {
      await session.withTransaction(async () => {
        transactionExpiredCount = 0;
        transactionActivatedCount = 0;

        const userObjectId =
          new mongoose.Types.ObjectId(userId);

        // Serialize lifecycle changes for this user.
        await User.updateOne(
          { _id: userObjectId },
          {
            $inc: {
              __billingRevision: 1,
            },
          },
          { session },
        );

        // Expire all subscriptions whose end date has passed.
        const expired = await Subscription.updateMany(
          {
            userId: userObjectId,
            status: "active",
            endsAt: { $lte: now },
          },
          {
            $set: {
              status: "expired",
            },
          },
          { session },
        );

        transactionExpiredCount = expired.modifiedCount;

        // Find the next queued subscription that is now eligible.
        const queued = await Subscription.findOne({
          userId: userObjectId,
          status: "pending",
          startsAt: { $lte: now },
          endsAt: { $gt: now },
        })
          .sort({
            startsAt: 1,
            createdAt: 1,
          })
          .session(session);

        if (queued) {
          queued.status = "active";

          await queued.save({ session });

          transactionActivatedCount = 1;

          await syncUserSubscription(
            userObjectId,
            queued,
            session,
          );

          return;
        }

        // There may already be another active subscription.
        const active = await Subscription.findOne({
          userId: userObjectId,
          status: "active",
          startsAt: { $lte: now },
          endsAt: { $gt: now },
        })
          .sort({
            endsAt: -1,
          })
          .session(session);

        if (active) {
          await syncUserSubscription(
            userObjectId,
            active,
            session,
          );
        } else {
          // No active subscription remains.
          await User.updateOne(
            { _id: userObjectId },
            {
              $set: {
                subscription: {
                  plan: "free",
                  status: "expired",
                  startsAt: null,
                  endsAt: null,
                },
              },
            },
            { session },
          );
        }
      });

      // Count only after the transaction successfully commits.
      expiredCount += transactionExpiredCount;
      activatedCount += transactionActivatedCount;
    } finally {
      await session.endSession();
    }
  }

  return {
    usersProcessed: userIds.length,
    expiredCount,
    activatedCount,
  };
}

export { addMonthsClamped };
