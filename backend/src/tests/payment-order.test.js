
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("../services/razorpay.service.js", () => ({
  getRazorpayClient: vi.fn(),
}));

import Payment from "../models/payment.model.js";
import { getRazorpayClient } from "../services/razorpay.service.js";
import { createRazorpayOrder } from "../services/payment-order.service.js";

let mongoServer;
let userId;
let createProviderOrder;

describe("Razorpay order creation", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Payment.syncIndexes();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    userId = new mongoose.Types.ObjectId();
    process.env.RAZORPAY_KEY_ID = "rzp_test_public_key";

    createProviderOrder = vi.fn().mockResolvedValue({
      id: "order_test_123",
      amount: 49999,
      currency: "INR",
      status: "created",
    });

    getRazorpayClient.mockReturnValue({
      orders: { create: createProviderOrder },
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("creates an order using the server-side plan amount", async () => {
    const result = await createRazorpayOrder({
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "checkout-test-001",
    });

    expect(createProviderOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 49999,
        currency: "INR",
        partial_payment: false,
      }),
    );

    expect(result.orderId).toBe("order_test_123");
    expect(result.amountPaise).toBe(49999);
    expect(result.status).toBe("pending");

    const saved = await Payment.findById(result.paymentId);
    expect(saved.provider).toBe("razorpay");
    expect(saved.providerOrderId).toBe("order_test_123");
    expect(saved.orderCreationStatus).toBe("created");
  });

  it("returns the existing order on a repeated request", async () => {
    const input = {
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "checkout-test-002",
    };

    const first = await createRazorpayOrder(input);
    const second = await createRazorpayOrder(input);

    expect(second.orderId).toBe(first.orderId);
    expect(second.paymentId).toBe(first.paymentId);
    expect(createProviderOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an idempotency key for a different plan", async () => {
    const input = {
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "checkout-test-003",
    };

    await createRazorpayOrder(input);

    await expect(
      createRazorpayOrder({
        ...input,
        planId: "pro_annual",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(createProviderOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing idempotency key", async () => {
    await expect(
      createRazorpayOrder({
        userId: userId.toString(),
        planId: "pro_monthly",
        idempotencyKey: undefined,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(createProviderOrder).not.toHaveBeenCalled();
  });

  it("rejects an unknown plan without calling Razorpay", async () => {
    await expect(
      createRazorpayOrder({
        userId: userId.toString(),
        planId: "made_up_plan",
        idempotencyKey: "checkout-test-004",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(createProviderOrder).not.toHaveBeenCalled();
  });
});
