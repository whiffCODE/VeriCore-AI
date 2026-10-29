
import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import Payment from "../models/payment.model.js";
import WebhookEvent from "../models/webhook-event.model.js";
import { handleRazorpayWebhook } from "../services/razorpay-webhook.service.js";

let mongoServer;
let userId;
let payment;

const secret = "local_test_webhook_secret_change_me_0123456789";

function createRawPayload(eventType, overrides = {}) {
  return Buffer.from(
    JSON.stringify({
      entity: "event",
      account_id: "acc_test_local",
      event: eventType,
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: "pay_test_webhook_123",
            entity: "payment",
            amount: 49999,
            currency: "INR",
            status: eventType === "payment.captured" ? "captured" : "failed",
            order_id: "order_test_webhook_123",
            error_code: null,
            error_description: null,
            ...overrides,
          },
        },
      },
      created_at: 1790000000,
    }),
  );
}

function sign(rawBody) {
  return createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
}

async function sendEvent({
  eventType = "payment.captured",
  eventId = "evt_local_001",
  overrides = {},
} = {}) {
  const rawBody = createRawPayload(eventType, overrides);

  return handleRazorpayWebhook({
    rawBody,
    signature: sign(rawBody),
    eventId,
  });
}

describe("Razorpay webhook processing", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await Promise.all([
      Payment.syncIndexes(),
      WebhookEvent.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      Payment.deleteMany({}),
      WebhookEvent.deleteMany({}),
    ]);

    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    userId = new mongoose.Types.ObjectId();

    payment = await Payment.create({
      userId,
      planId: "pro_monthly",
      tier: "pro",
      provider: "razorpay",
      amountPaise: 49999,
      currency: "INR",
      idempotencyKey: "webhook-test-001",
      providerOrderId: "order_test_webhook_123",
      orderCreationStatus: "created",
      status: "pending",
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("accepts a valid captured event and records the payment", async () => {
    const result = await sendEvent();

    expect(result.received).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.outcome).toBe("payment_captured");

    const savedPayment = await Payment.findById(payment._id);
    expect(savedPayment.status).toBe("captured");
    expect(savedPayment.providerPaymentId).toBe("pay_test_webhook_123");

    const event = await WebhookEvent.findOne({
      provider: "razorpay",
      eventId: "evt_local_001",
    });

    expect(event.status).toBe("processed");
    expect(event.attempts).toBe(1);
  });

  it("rejects a forged signature without storing an event", async () => {
    const rawBody = createRawPayload("payment.captured");

    await expect(
      handleRazorpayWebhook({
        rawBody,
        signature: "0".repeat(64),
        eventId: "evt_forged_001",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await WebhookEvent.countDocuments()).toBe(0);
    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });

  it("does not process the same event twice", async () => {
    const first = await sendEvent();
    const second = await sendEvent();

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await WebhookEvent.countDocuments()).toBe(1);
    expect((await Payment.findById(payment._id)).status).toBe("captured");
  });

  it("rejects a different payload using an already-used event ID", async () => {
    await sendEvent();

    await expect(
      sendEvent({
        eventId: "evt_local_001",
        overrides: { amount: 100 },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await WebhookEvent.countDocuments()).toBe(1);
  });

  it("does not capture a payment when the amount does not match", async () => {
    await expect(
      sendEvent({
        eventId: "evt_wrong_amount",
        overrides: { amount: 100 },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect((await Payment.findById(payment._id)).status).toBe("pending");

    const event = await WebhookEvent.findOne({
      eventId: "evt_wrong_amount",
    });

    expect(event.status).toBe("failed");
  });

  it("records a failed attempt without permanently failing the order", async () => {
    await sendEvent({
      eventType: "payment.failed",
      eventId: "evt_failed_attempt",
      overrides: {
        status: "failed",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Local simulated failure",
      },
    });

    const savedPayment = await Payment.findById(payment._id);

    expect(savedPayment.status).toBe("pending");
    expect(savedPayment.failureCode).toBe("BAD_REQUEST_ERROR");
  });

  it("ignores an event for an order not owned by this billing system", async () => {
    await sendEvent({
      eventId: "evt_unmatched",
      overrides: { order_id: "order_not_in_database" },
    });

    const event = await WebhookEvent.findOne({
      eventId: "evt_unmatched",
    });

    expect(event.status).toBe("processed");
    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });
});
