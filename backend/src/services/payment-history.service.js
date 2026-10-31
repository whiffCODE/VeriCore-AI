import mongoose from "mongoose";

import Payment from "../models/payment.model.js";
import Receipt from "../models/receipt.model.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const ALLOWED_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
];

const ALLOWED_PROVIDERS = ["razorpay", "stripe"];

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function encodeCursor(payment) {
  return Buffer.from(
    JSON.stringify({
      createdAt: payment.createdAt.toISOString(),
      id: payment._id.toString(),
    })
  ).toString("base64url");
}

function decodeCursor(cursor) {
  try {
    if (typeof cursor !== "string" || cursor.length === 0) {
      throw new Error("Invalid cursor");
    }

    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    if (
      !decoded ||
      typeof decoded.createdAt !== "string" ||
      typeof decoded.id !== "string" ||
      !mongoose.isValidObjectId(decoded.id)
    ) {
      throw new Error("Invalid cursor");
    }

    const createdAt = new Date(decoded.createdAt);

    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== decoded.createdAt
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      createdAt,
      id: new mongoose.Types.ObjectId(decoded.id),
    };
  } catch {
    throw createValidationError("Invalid payment history cursor");
  }
}

export async function getPaymentHistory({
  userId,
  limit = DEFAULT_LIMIT,
  cursor,
  status,
  provider,
  from,
  to,
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw createValidationError("Invalid user ID");
  }

  const parsedLimit = Number(limit);

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIMIT
  ) {
    throw createValidationError(
      `Limit must be between 1 and ${MAX_LIMIT}`
    );
  }

  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
  };

  if (status) {
    if (!ALLOWED_STATUSES.includes(status)) {
      throw createValidationError("Invalid payment status");
    }

    filter.status = status;
  }

  if (provider) {
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      throw createValidationError("Invalid payment provider");
    }

    filter.provider = provider;
  }

  if (from || to) {
    const createdAtFilter = {};

    if (from) {
      const fromDate = new Date(from);

      if (Number.isNaN(fromDate.getTime())) {
        throw createValidationError("Invalid from date");
      }

      createdAtFilter.$gte = fromDate;
    }

    if (to) {
      const toDate = new Date(to);

      if (Number.isNaN(toDate.getTime())) {
        throw createValidationError("Invalid to date");
      }

      createdAtFilter.$lte = toDate;
    }

    if (
      createdAtFilter.$gte &&
      createdAtFilter.$lte &&
      createdAtFilter.$gte > createdAtFilter.$lte
    ) {
      throw createValidationError(
        "From date must not be later than to date"
      );
    }

    filter.createdAt = createdAtFilter;
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);

    // Stable descending pagination by createdAt, then _id.
    filter.$and = [
      {
        $or: [
          {
            createdAt: {
              $lt: decoded.createdAt,
            },
          },
          {
            createdAt: decoded.createdAt,
            _id: {
              $lt: decoded.id,
            },
          },
        ],
      },
    ];
  }

  const payments = await Payment.find(filter)
    .select(
      [
        "_id",
        "userId",
        "provider",
        "providerOrderId",
        "providerPaymentId",
        "providerCheckoutSessionId",
        "planId",
        "tier",
        "amountPaise",
        "currency",
        "status",
        "createdAt",
        "paidAt",
        "refundedAt",
        "failureCode",
        "failureMessage",
        "subscriptionId",
        "receiptNumber",
      ].join(" ")
    )
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(parsedLimit + 1)
    .lean();

  const hasMore = payments.length > parsedLimit;
  const items = payments.slice(0, parsedLimit);

  const receipts =
    items.length > 0
      ? await Receipt.find({
          userId: new mongoose.Types.ObjectId(userId),
          paymentId: {
            $in: items.map((payment) => payment._id),
          },
        })
          .select("paymentId receiptNumber")
          .lean()
      : [];

  const receiptMap = new Map(
    receipts.map((receipt) => [
      receipt.paymentId.toString(),
      receipt,
    ])
  );

  const results = items.map((payment) => {
    const receipt = receiptMap.get(payment._id.toString());

    return {
      id: payment._id,
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      providerCheckoutSessionId:
        payment.providerCheckoutSessionId,

      planId: payment.planId,
      tier: payment.tier,

      // Stored in paise. The frontend can format this as INR.
      amountPaise: payment.amountPaise,
      currency: payment.currency,

      status: payment.status,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,

      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      subscriptionId: payment.subscriptionId,

      receipt: receipt
        ? {
            receiptNumber: receipt.receiptNumber,
            available: true,
          }
        : null,
    };
  });

  return {
    items: results,
    pagination: {
      limit: parsedLimit,
      hasMore,
      nextCursor:
        hasMore && items.length > 0
          ? encodeCursor(items[items.length - 1])
          : null,
    },
  };
}
