
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

vi.mock("../services/stripe.service.js", () => ({
  getStripeClient: vi.fn(),
}));

import Payment from "../models/payment.model.js";
import { getStripeClient } from "../services/stripe.service.js";
import { createStripeCheckoutSession } from "../services/stripe-checkout.service.js";

let mongoServer;
let userId;
let createSession;
let retrieveSession;

describe("Stripe Checkout Session creation", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Payment.syncIndexes();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});

    userId = new mongoose.Types.ObjectId();
    process.env.FRONTEND_URL = "http://localhost:3000";

    retrieveSession = vi.fn();

    createSession = vi.fn().mockImplementation(async (input) => ({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      status: "open",
      mode: input.mode,
      payment_status: "unpaid",
    }));

    getStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
          retrieve: retrieveSession,
        },
      },
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("creates a hosted Checkout Session using the server-side price", async () => {
    const result = await createStripeCheckoutSession({
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "stripe-checkout-test-001",
    });

    expect(createSession).toHaveBeenCalledTimes(1);

    const [request, options] = createSession.mock.calls[0];

    expect(request.mode).toBe("payment");
    expect(request.line_items[0].price_data.unit_amount).toBe(49999);
    expect(request.line_items[0].price_data.currency).toBe("inr");
    expect(request.metadata.planId).toBe("pro_monthly");
    expect(request.success_url).toContain("{CHECKOUT_SESSION_ID}");
    expect(options.idempotencyKey).toMatch(/^vericore-checkout-/);

    expect(result.sessionId).toBe("cs_test_123");
    expect(result.checkoutUrl).toContain("checkout.stripe.com");
    expect(result.status).toBe("pending");

    const saved = await Payment.findById(result.paymentId);
    expect(saved.provider).toBe("stripe");
    expect(saved.providerCheckoutSessionId).toBe("cs_test_123");
    expect(saved.checkoutCreationStatus).toBe("created");
  });

  it("returns the existing session for the same idempotency key", async () => {
    const input = {
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "stripe-checkout-test-002",
    };

    await createStripeCheckoutSession(input);

    retrieveSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      status: "open",
    });

    const second = await createStripeCheckoutSession(input);

    expect(second.sessionId).toBe("cs_test_123");
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(retrieveSession).toHaveBeenCalledWith("cs_test_123");
  });

  it("rejects reuse of a key for a different plan", async () => {
    const input = {
      userId: userId.toString(),
      planId: "pro_monthly",
      idempotencyKey: "stripe-checkout-test-003",
    };

    await createStripeCheckoutSession(input);

    await expect(
      createStripeCheckoutSession({
        ...input,
        planId: "pro_annual",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown plan without calling Stripe", async () => {
    await expect(
      createStripeCheckoutSession({
        userId: userId.toString(),
        planId: "unknown_plan",
        idempotencyKey: "stripe-checkout-test-004",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a missing idempotency key", async () => {
    await expect(
      createStripeCheckoutSession({
        userId: userId.toString(),
        planId: "pro_monthly",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects insecure frontend URLs in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "http://localhost:3000";

    await expect(
      createStripeCheckoutSession({
        userId: userId.toString(),
        planId: "pro_monthly",
        idempotencyKey: "stripe-checkout-test-005",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(createSession).not.toHaveBeenCalled();

    delete process.env.NODE_ENV;
  });
});
