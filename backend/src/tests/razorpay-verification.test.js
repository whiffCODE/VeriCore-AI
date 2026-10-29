
import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("../services/razorpay.service.js", () => ({
  getRazorpayClient: vi.fn(),
}));

import Payment from "../models/payment.model.js";
import { getRazorpayClient } from "../services/razorpay.service.js";
import { verifyRazorpayCheckout } from "../services/razorpay-verification.service.js";

let mongoServer;
let userId;
let payment;
let fetchPayment;

const secret = "test_razorpay_secret_do_not_use_in_production";

function sign(orderId, paymentId) {
  return createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

async function createPendingPayment() {
  return Payment.create({
    userId,
    planId: "pro_monthly",
    tier: "pro",
    provider: "razorpay",
    amountPaise: 49999,
    currency: "INR",
    idempotencyKey: "verify-test-001",
    providerOrderId: "order_test_123",
    orderCreationStatus: "created",
    status: "pending",
  });
}

function callback(overrides = {}) {
  return {
    userId: userId.toString(),
    razorpay_order_id: "order_test_123",
    razorpay_payment_id: "pay_test_123",
    razorpay_signature: sign("order_test_123", "pay_test_123"),
    ...overrides,
  };
}

describe("Razorpay Checkout verification", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Payment.syncIndexes();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    userId = new mongoose.Types.ObjectId();
    process.env.RAZORPAY_KEY_SECRET = secret;

    fetchPayment = vi.fn().mockResolvedValue({
      id: "pay_test_123",
      order_id: "order_test_123",
      amount: 49999,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    getRazorpayClient.mockReturnValue({
      payments: { fetch: fetchPayment },
    });

    payment = await createPendingPayment();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("verifies a valid signature and captured provider payment", async () => {
    const result = await verifyRazorpayCheckout(callback());

    expect(result.status).toBe("captured");
    expect(result.alreadyVerified).toBe(false);
    expect(fetchPayment).toHaveBeenCalledWith("pay_test_123");

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("captured");
    expect(saved.providerPaymentId).toBe("pay_test_123");
    expect(saved.paidAt).toBeInstanceOf(Date);
  });

  it("rejects a forged signature before calling Razorpay", async () => {
    await expect(
      verifyRazorpayCheckout(
        callback({ razorpay_signature: "f".repeat(64) }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(fetchPayment).not.toHaveBeenCalled();

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("pending");
  });

  it("rejects a provider payment with the wrong amount", async () => {
    fetchPayment.mockResolvedValue({
      id: "pay_test_123",
      order_id: "order_test_123",
      amount: 100,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    await expect(
      verifyRazorpayCheckout(callback()),
    ).rejects.toMatchObject({ statusCode: 400 });

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("pending");
  });

  it("rejects a payment belonging to a different order", async () => {
    fetchPayment.mockResolvedValue({
      id: "pay_test_123",
      order_id: "order_another",
      amount: 49999,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    await expect(
      verifyRazorpayCheckout(callback()),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });

  it("does not activate access for an authorized but uncaptured payment", async () => {
    fetchPayment.mockResolvedValue({
      id: "pay_test_123",
      order_id: "order_test_123",
      amount: 49999,
      currency: "INR",
      status: "authorized",
      captured: false,
    });

    await expect(
      verifyRazorpayCheckout(callback()),
    ).rejects.toMatchObject({ statusCode: 409 });

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("authorized");
    expect(saved.providerPaymentId).toBe("pay_test_123");
  });

  it("keeps the order pending after a failed attempt", async () => {
    fetchPayment.mockResolvedValue({
      id: "pay_test_123",
      order_id: "order_test_123",
      amount: 49999,
      currency: "INR",
      status: "failed",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "Test payment failed",
    });

    await expect(
      verifyRazorpayCheckout(callback()),
    ).rejects.toMatchObject({ statusCode: 402 });

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("pending");
    expect(saved.failureCode).toBe("BAD_REQUEST_ERROR");
  });

  it("handles the same captured callback idempotently", async () => {
    const first = await verifyRazorpayCheckout(callback());
    const second = await verifyRazorpayCheckout(callback());

    expect(first.status).toBe("captured");
    expect(second.status).toBe("captured");
    expect(second.alreadyVerified).toBe(true);
    expect(fetchPayment).toHaveBeenCalledTimes(1);
  });

  it("does not let another user verify this order", async () => {
    const anotherUser = new mongoose.Types.ObjectId();

    await expect(
      verifyRazorpayCheckout({
        ...callback(),
        userId: anotherUser.toString(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(fetchPayment).not.toHaveBeenCalled();
  });
});
