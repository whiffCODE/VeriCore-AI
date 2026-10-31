import crypto from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import Payment from "../models/payment.model.js";
import { Receipt } from "../models/receipt.model.js";

import { createReceiptForPayment } from "../services/receipt.service.js";
import { getSubscriptionPlan } from "../config/subscription-plans.js";

const TEST_PLAN_ID = "pro_monthly";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();

  await mongoose.connect(mongoServer.getUri(), {
    dbName: "vericore_receipt_tests",
  });
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

async function createTestUser(overrides = {}) {
  return User.create({
    firstName: "Test",
    lastName: "Customer",
    email: `customer-${crypto.randomUUID()}@example.com`,
    phone: `+919${String(
      Math.floor(Math.random() * 1_000_000_000)
    ).padStart(9, "0")}`,
    age: 25,
    passwordHash: "test-password-hash",
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
    subscription: {
      plan: "free",
      status: "trial",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    ...overrides,
  });
}

async function createTestPayment({
  userId,
  status = "captured",
  providerPaymentId = `pay_${crypto.randomUUID()}`,
  provider = "razorpay",
  planId = TEST_PLAN_ID,
  overrides = {},
} = {}) {
  const plan = getSubscriptionPlan(planId);

  if (!plan) {
    throw new Error(`Unknown test plan: ${planId}`);
  }

  return Payment.create({
    userId,
    provider,
    providerOrderId: `order_${crypto.randomUUID()}`,
    providerPaymentId,
    planId,
    tier: plan.tier,
    amountPaise: plan.amountPaise,
    currency: plan.currency,
    status,
    paidAt: status === "captured" ? new Date() : undefined,
    idempotencyKey: `test-${crypto.randomUUID()}`,
    ...overrides,
  });
}

describe("receipt.service", () => {
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Payment.deleteMany({}),
      Receipt.deleteMany({}),
    ]);
  });

  it("creates a receipt for a captured payment", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({ userId: user._id });

    const receipt = await createReceiptForPayment(payment._id);

    expect(receipt).toBeDefined();
    expect(receipt.paymentId.toString()).toBe(payment._id.toString());
    expect(receipt.userId.toString()).toBe(user._id.toString());

    expect(receipt.provider).toBe("razorpay");
    expect(receipt.providerPaymentId).toBe(payment.providerPaymentId);
    expect(receipt.planId).toBe(TEST_PLAN_ID);
    expect(receipt.planName).toBe("PRO Monthly");

    expect(receipt.amountPaise).toBe(payment.amountPaise);
    expect(receipt.currency).toBe("INR");

    expect(receipt.customer.name).toBe("Test Customer");
    expect(receipt.customer.email).toBe(user.email);

    expect(receipt.receiptNumber).toMatch(
      /^VC-\d{4}-[A-F0-9]{12}$/
    );
    expect(receipt.paymentDate).toBeInstanceOf(Date);

    expect(
      await Receipt.countDocuments({ paymentId: payment._id })
    ).toBe(1);
  });

  it("rejects receipt creation for a pending payment", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({
      userId: user._id,
      status: "pending",
    });

    await expect(
      createReceiptForPayment(payment._id)
    ).rejects.toThrow(
      "A receipt can only be generated for captured payments"
    );

    expect(await Receipt.countDocuments()).toBe(0);
  });

  it("rejects receipt creation for a failed payment", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({
      userId: user._id,
      status: "failed",
    });

    await expect(
      createReceiptForPayment(payment._id)
    ).rejects.toThrow(
      "A receipt can only be generated for captured payments"
    );

    expect(await Receipt.countDocuments()).toBe(0);
  });

  it("returns the existing receipt when called more than once", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({ userId: user._id });

    const firstReceipt = await createReceiptForPayment(payment._id);
    const secondReceipt = await createReceiptForPayment(payment._id);

    expect(secondReceipt._id.toString()).toBe(
      firstReceipt._id.toString()
    );
    expect(secondReceipt.receiptNumber).toBe(
      firstReceipt.receiptNumber
    );

    expect(
      await Receipt.countDocuments({ paymentId: payment._id })
    ).toBe(1);
  });

  it("rejects a captured payment without a provider payment ID", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({ userId: user._id });

    await Payment.updateOne(
      { _id: payment._id },
      { $unset: { providerPaymentId: 1 } }
    );

    await expect(
      createReceiptForPayment(payment._id)
    ).rejects.toThrow("Verified provider payment ID is required");

    expect(await Receipt.countDocuments()).toBe(0);
  });

  it("rejects an invalid payment ID", async () => {
    await expect(
      createReceiptForPayment("not-a-valid-object-id")
    ).rejects.toThrow("Invalid payment ID");
  });

  it("rejects a payment that does not exist", async () => {
    const unknownPaymentId = new mongoose.Types.ObjectId();

    await expect(
      createReceiptForPayment(unknownPaymentId)
    ).rejects.toThrow("Payment not found");
  });

  it("rejects receipt creation when the payment owner does not exist", async () => {
    const payment = await createTestPayment({
      userId: new mongoose.Types.ObjectId(),
    });

    await expect(
      createReceiptForPayment(payment._id)
    ).rejects.toThrow("Payment owner not found");

    expect(await Receipt.countDocuments()).toBe(0);
  });

  it("creates only one receipt for concurrent requests", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({ userId: user._id });

    const [receiptA, receiptB] = await Promise.all([
      createReceiptForPayment(payment._id),
      createReceiptForPayment(payment._id),
    ]);

    expect(receiptA._id.toString()).toBe(receiptB._id.toString());
    expect(receiptA.receiptNumber).toBe(receiptB.receiptNumber);

    expect(
      await Receipt.countDocuments({ paymentId: payment._id })
    ).toBe(1);
  });

  it("supports Stripe payments", async () => {
    const user = await createTestUser();
    const payment = await createTestPayment({
      userId: user._id,
      provider: "stripe",
      providerPaymentId: `pi_${crypto.randomUUID()}`,
      overrides: {
        providerCheckoutSessionId: `cs_${crypto.randomUUID()}`,
      },
    });

    const receipt = await createReceiptForPayment(payment._id);

    expect(receipt.provider).toBe("stripe");
    expect(receipt.providerPaymentId).toBe(payment.providerPaymentId);
  });
});
