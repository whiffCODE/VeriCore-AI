import crypto from "node:crypto";
import mongoose from "mongoose";

import Payment from "../models/payment.model.js";
import Receipt from "../models/receipt.model.js";
import User from "../models/user.model.js";

import { getSubscriptionPlan } from "../config/subscription-plans.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function generateReceiptNumber(date = new Date()) {
  const year = date.getUTCFullYear();

  const randomPart = crypto.randomUUID()
    .replaceAll("-", "")
    .slice(0, 12)
    .toUpperCase();

  return `VC-${year}-${randomPart}`;
}

export async function createReceiptForPayment(paymentId) {
  if (!mongoose.isValidObjectId(paymentId)) {
    throw createHttpError("Invalid payment ID", 400);
  }

  const payment = await Payment.findById(paymentId);

  if (!payment) {
    throw createHttpError("Payment not found", 404);
  }

  if (payment.status !== "captured") {
    throw createHttpError(
      "A receipt can only be generated for captured payments",
      409,
    );
  }

  if (!payment.providerPaymentId) {
    throw createHttpError(
      "Verified provider payment ID is required",
      409,
    );
  }

  // Return the existing receipt if one has already been generated.
  const existingReceipt = await Receipt.findOne({
    paymentId: payment._id,
  });

  if (existingReceipt) {
    return existingReceipt;
  }

  const user = await User.findById(payment.userId);

  if (!user) {
    throw createHttpError("Payment owner not found", 404);
  }

  const plan = getSubscriptionPlan(payment.planId);

  if (!plan) {
    throw createHttpError("Subscription plan not found", 409);
  }

  const customerName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!customerName || !user.email) {
    throw createHttpError(
      "Customer billing details are incomplete",
      409,
    );
  }

  try {
    const receipt = await Receipt.create({
      receiptNumber: generateReceiptNumber(),

      paymentId: payment._id,
      userId: payment.userId,

      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,

      planId: payment.planId,
      planName: plan.name,

      // Preserve the original integer amount in paise.
      amountPaise: payment.amountPaise,
      currency: payment.currency,

      customer: {
        name: customerName,
        email: user.email,
      },

      paymentDate: payment.paidAt || new Date(),

      description: `${plan.name} subscription payment`,
    });

    // Keep the Payment receiptNumber field in sync.
    await Payment.updateOne(
      {
        _id: payment._id,
        status: "captured",
        receiptNumber: { $exists: false },
      },
      {
        $set: {
          receiptNumber: receipt.receiptNumber,
        },
      },
    );

    return receipt;
  } catch (error) {
    // Another concurrent request may have created the receipt first.
    if (error.code === 11000) {
      const existing = await Receipt.findOne({
        paymentId: payment._id,
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}
