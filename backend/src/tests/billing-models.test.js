
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import Payment from "../models/payment.model.js";
import Subscription from "../models/subscription.model.js";
import WebhookEvent from "../models/webhook-event.model.js";

let mongoServer;
let userId;

const validPayment = (overrides = {}) => ({
  userId,
  planId: "pro_monthly",
  tier: "pro",
  provider: "razorpay",
  amountPaise: 49999,
  currency: "INR",
  idempotencyKey: "checkout-request-001",
  ...overrides,
});

describe("billing database models", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await Promise.all([
      Payment.syncIndexes(),
      Subscription.syncIndexes(),
      WebhookEvent.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      Payment.deleteMany({}),
      Subscription.deleteMany({}),
      WebhookEvent.deleteMany({}),
    ]);

    userId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  describe("Payment", () => {
    it("creates a pending payment using server-defined amount fields", async () => {
      const payment = await Payment.create(validPayment());

      expect(payment.status).toBe("pending");
      expect(payment.amountPaise).toBe(49999);
      expect(payment.currency).toBe("INR");
    });

    it("rejects a non-integer payment amount", async () => {
      const payment = new Payment(validPayment({ amountPaise: 499.99 }));

      await expect(payment.validate()).rejects.toThrow(
        /integer in paise/i,
      );
    });

    it("rejects unsupported currencies", async () => {
      const payment = new Payment(validPayment({ currency: "USD" }));

      await expect(payment.validate()).rejects.toThrow();
    });

    it("prevents the same user idempotency key from creating two payments", async () => {
      await Payment.create(validPayment());

      await expect(Payment.create(validPayment())).rejects.toMatchObject({
        code: 11000,
      });
    });

    it("prevents duplicate provider payment IDs", async () => {
      await Payment.create(
        validPayment({
          idempotencyKey: "checkout-request-001",
          providerPaymentId: "pay_test_001",
        }),
      );

      await expect(
        Payment.create(
          validPayment({
            idempotencyKey: "checkout-request-002",
            providerPaymentId: "pay_test_001",
          }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe("Subscription", () => {
    it("rejects an active subscription without start and end dates", async () => {
      const subscription = new Subscription({
        userId,
        paymentId: new mongoose.Types.ObjectId(),
        planId: "pro_monthly",
        tier: "pro",
        status: "active",
        provider: "razorpay",
      });

      await expect(subscription.validate()).rejects.toThrow();
    });

    it("rejects an end date that is not after the start date", async () => {
      const start = new Date("2026-01-01T00:00:00.000Z");

      const subscription = new Subscription({
        userId,
        paymentId: new mongoose.Types.ObjectId(),
        planId: "pro_monthly",
        tier: "pro",
        status: "active",
        provider: "razorpay",
        startsAt: start,
        endsAt: start,
      });

      await expect(subscription.validate()).rejects.toThrow();
    });

    it("stores historical subscriptions with auto-renew disabled by default", async () => {
      const subscription = await Subscription.create({
        userId,
        paymentId: new mongoose.Types.ObjectId(),
        planId: "pro_monthly",
        tier: "pro",
        status: "pending",
        provider: "razorpay",
      });

      expect(subscription.autoRenew).toBe(false);
    });
  });

  describe("WebhookEvent", () => {
    const validEvent = (overrides = {}) => ({
      provider: "stripe",
      eventId: "evt_test_001",
      eventType: "checkout.session.completed",
      payloadHash: "a".repeat(64),
      ...overrides,
    });

    it("records a provider event", async () => {
      const event = await WebhookEvent.create(validEvent());

      expect(event.status).toBe("received");
      expect(event.attempts).toBe(0);
    });

    it("rejects duplicate event IDs from the same provider", async () => {
      await WebhookEvent.create(validEvent());

      await expect(
        WebhookEvent.create(validEvent()),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same event ID from different providers", async () => {
      await WebhookEvent.create(validEvent());

      const event = await WebhookEvent.create(
        validEvent({ provider: "razorpay" }),
      );

      expect(event.provider).toBe("razorpay");
    });

    it("rejects an invalid payload hash", async () => {
      const event = new WebhookEvent(
        validEvent({ payloadHash: "not-a-sha256-hash" }),
      );

      await expect(event.validate()).rejects.toThrow();
    });
  });
});
