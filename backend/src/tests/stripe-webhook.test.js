
import Stripe from "stripe";
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
import WebhookEvent from "../models/webhook-event.model.js";
import { getStripeClient } from "../services/stripe.service.js";
import { handleStripeWebhook } from "../services/stripe-webhook.service.js";

let mongoServer;
let userId;
let payment;
let retrieveSession;

const secret = "whsec_test_local_vericore_0123456789";
const signer = new Stripe("sk_test_vericore_webhook_tests");

function makeEvent({
  id = "evt_test_001",
  type = "checkout.session.completed",
  sessionId = "cs_test_123",
} = {}) {
  return {
    id,
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode: "payment",
      },
    },
  };
}

function signedRequest(event, signingSecret = secret) {
  const rawBody = Buffer.from(JSON.stringify(event));

  const signature = signer.webhooks.generateTestHeaderString({
    payload: rawBody.toString("utf8"),
    secret: signingSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });

  return { rawBody, signature };
}

async function sendEvent(options = {}) {
  const event = makeEvent(options);
  const request = signedRequest(event);

  const result = await handleStripeWebhook(request);

  return { result, event, ...request };
}

describe("Stripe webhook processing", () => {
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

    process.env.STRIPE_WEBHOOK_SECRET = secret;
    userId = new mongoose.Types.ObjectId();

    retrieveSession = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      object: "checkout.session",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 49999,
      currency: "inr",
      client_reference_id: null,
      metadata: {
        paymentId: "",
        userId: "",
        planId: "pro_monthly",
      },
      payment_intent: "pi_test_123",
    });

    getStripeClient.mockReturnValue({
      webhooks: signer.webhooks,
      checkout: {
        sessions: {
          retrieve: retrieveSession,
        },
      },
    });

    payment = await Payment.create({
      userId,
      planId: "pro_monthly",
      tier: "pro",
      provider: "stripe",
      amountPaise: 49999,
      currency: "INR",
      idempotencyKey: "stripe-webhook-test-001",
      providerCheckoutSessionId: "cs_test_123",
      checkoutCreationStatus: "created",
      status: "pending",
    });

    retrieveSession.mockImplementation(async () => ({
      id: "cs_test_123",
      object: "checkout.session",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 49999,
      currency: "inr",
      client_reference_id: payment._id.toString(),
      metadata: {
        paymentId: payment._id.toString(),
        userId: userId.toString(),
        planId: "pro_monthly",
      },
      payment_intent: "pi_test_123",
    }));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("verifies a signed event and records the captured payment", async () => {
    const { result } = await sendEvent();

    expect(result.received).toBe(true);
    expect(result.outcome).toBe("payment_captured");

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe("captured");
    expect(saved.providerPaymentId).toBe("pi_test_123");

    const event = await WebhookEvent.findOne({
      provider: "stripe",
      eventId: "evt_test_001",
    });

    expect(event.status).toBe("processed");
  });

  it("rejects a forged signature without storing an event", async () => {
    const event = makeEvent();
    const { rawBody } = signedRequest(event);

    await expect(
      handleStripeWebhook({
        rawBody,
        signature: "t=1,v1=" + "0".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await WebhookEvent.countDocuments()).toBe(0);
    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });

  it("rejects a modified payload", async () => {
    const event = makeEvent();
    const signed = signedRequest(event);
    const modified = Buffer.from(
      signed.rawBody.toString("utf8").replace("cs_test_123", "cs_test_bad"),
    );

    await expect(
      handleStripeWebhook({
        rawBody: modified,
        signature: signed.signature,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  it("processes the same event only once", async () => {
    const first = await sendEvent();
    const second = await handleStripeWebhook({
      rawBody: first.rawBody,
      signature: first.signature,
    });

    expect(first.result.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await WebhookEvent.countDocuments()).toBe(1);
    expect(retrieveSession).toHaveBeenCalledTimes(1);
  });

  it("rejects the same event ID with a different payload", async () => {
    const first = await sendEvent();

    const different = signedRequest(
      makeEvent({
        id: first.event.id,
        type: "checkout.session.async_payment_succeeded",
      }),
    );

    await expect(
      handleStripeWebhook(different),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await WebhookEvent.countDocuments()).toBe(1);
  });

  it("does not capture a session whose amount differs from the stored payment", async () => {
    retrieveSession.mockImplementation(async () => ({
      id: "cs_test_123",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 100,
      currency: "inr",
      client_reference_id: payment._id.toString(),
      metadata: {
        paymentId: payment._id.toString(),
        userId: userId.toString(),
        planId: "pro_monthly",
      },
      payment_intent: "pi_test_123",
    }));

    await expect(
      sendEvent({ id: "evt_wrong_amount" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });

  it("leaves an unpaid completed session pending", async () => {
    retrieveSession.mockImplementation(async () => ({
      id: "cs_test_123",
      mode: "payment",
      status: "complete",
      payment_status: "unpaid",
      amount_total: 49999,
      currency: "inr",
      client_reference_id: payment._id.toString(),
      metadata: {
        paymentId: payment._id.toString(),
        userId: userId.toString(),
        planId: "pro_monthly",
      },
      payment_intent: null,
    }));

    const { result } = await sendEvent({ id: "evt_unpaid" });

    expect(result.outcome).toBe("awaiting_payment");
    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });

  it("ignores a session that does not match a stored payment", async () => {
    retrieveSession.mockImplementation(async () => ({
      id: "cs_test_123",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 49999,
      currency: "inr",
      client_reference_id: "000000000000000000000001",
      metadata: {
        paymentId: "000000000000000000000001",
        userId: "000000000000000000000002",
        planId: "pro_monthly",
      },
      payment_intent: "pi_test_123",
    }));

    const { result } = await sendEvent({ id: "evt_unmatched" });

    expect(result.outcome).toBe("ignored_unmatched_session");
    expect((await Payment.findById(payment._id)).status).toBe("pending");
  });
});
