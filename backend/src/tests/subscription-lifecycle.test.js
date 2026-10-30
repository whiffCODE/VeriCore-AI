
import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import User from "../models/user.model.js";
import Payment from "../models/payment.model.js";
import Subscription from "../models/subscription.model.js";
import {
  activateSubscriptionForPayment,
  processSubscriptionExpiries,
} from "../services/subscription-lifecycle.service.js";

let mongoServer;
let user;
let sequence = 0;

async function createTestUser() {
  sequence += 1;

  return User.create({
    firstName: "Billing",
    lastName: "Test",
    email: `billing-test-${sequence}@example.com`,
    phone: `+155500000${sequence}`,
    age: 25,
    passwordHash: "test-only-password-hash",
    emailVerifiedAt: new Date(),
    subscription: {
      plan: "free",
      status: "trial",
    },
  });
}

async function createCapturedPayment({
  userId,
  planId = "pro_monthly",
  provider = "razorpay",
  paymentSuffix = "001",
}) {
  const isEnterprise = planId.startsWith("enterprise");

  return Payment.create({
    userId,
    planId,
    tier: isEnterprise ? "enterprise" : "pro",
    provider,
    amountPaise:
      planId === "pro_monthly"
        ? 49999
        : planId === "pro_annual"
          ? 499999
          : planId === "pro_quarterly"
            ? 139999
            : planId === "pro_semiannual"
              ? 259999
              : planId === "enterprise_annual"
                ? 799999
                : 559999,
    currency: "INR",
    idempotencyKey: `lifecycle-${provider}-${paymentSuffix}`,
    providerOrderId:
      provider === "razorpay" ? `order_lifecycle_${paymentSuffix}` : undefined,
    providerPaymentId:
      provider === "razorpay"
        ? `pay_lifecycle_${paymentSuffix}`
        : `pi_lifecycle_${paymentSuffix}`,
    providerCheckoutSessionId:
      provider === "stripe" ? `cs_lifecycle_${paymentSuffix}` : undefined,
    status: "captured",
    paidAt: new Date(),
  });
}

describe("subscription lifecycle", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(mongoServer.getUri());

    await Promise.all([
      User.syncIndexes(),
      Payment.syncIndexes(),
      Subscription.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      Subscription.deleteMany({}),
      Payment.deleteMany({}),
      User.deleteMany({}),
    ]);

    user = await createTestUser();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it("activates a Razorpay subscription from a captured payment", async () => {
    const payment = await createCapturedPayment({
      userId: user._id,
      provider: "razorpay",
      paymentSuffix: "101",
    });

    const result = await activateSubscriptionForPayment(payment._id);

    expect(result.status).toBe("active");
    expect(result.alreadyActivated).toBe(false);

    const subscription = await Subscription.findById(result.subscriptionId);
    const savedPayment = await Payment.findById(payment._id);
    const savedUser = await User.findById(user._id);

    expect(subscription.provider).toBe("razorpay");
    expect(subscription.endsAt.getTime()).toBeGreaterThan(
      subscription.startsAt.getTime(),
    );
    expect(savedPayment.subscriptionId.toString()).toBe(
      subscription._id.toString(),
    );
    expect(savedUser.subscription.plan).toBe("pro");
    expect(savedUser.subscription.status).toBe("active");
  });

  it("activates a Stripe subscription through the same service", async () => {
    const payment = await createCapturedPayment({
      userId: user._id,
      provider: "stripe",
      paymentSuffix: "102",
    });

    const result = await activateSubscriptionForPayment(payment._id);

    const subscription = await Subscription.findById(result.subscriptionId);

    expect(result.status).toBe("active");
    expect(subscription.provider).toBe("stripe");
    expect(subscription.tier).toBe("pro");
  });

  it("does not create a second subscription for the same payment", async () => {
    const payment = await createCapturedPayment({
      userId: user._id,
      paymentSuffix: "103",
    });

    const first = await activateSubscriptionForPayment(payment._id);
    const second = await activateSubscriptionForPayment(payment._id);

    expect(first.subscriptionId).toBe(second.subscriptionId);
    expect(second.alreadyActivated).toBe(true);
    expect(await Subscription.countDocuments({ paymentId: payment._id })).toBe(1);
  });

  it("rejects a payment that has not been captured", async () => {
    const payment = await Payment.create({
      userId: user._id,
      planId: "pro_monthly",
      tier: "pro",
      provider: "razorpay",
      amountPaise: 49999,
      currency: "INR",
      idempotencyKey: "lifecycle-pending-104",
      providerOrderId: "order_lifecycle_104",
      status: "pending",
    });

    await expect(
      activateSubscriptionForPayment(payment._id),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await Subscription.countDocuments({ userId: user._id })).toBe(0);
  });

  it("queues a renewal after the current paid period", async () => {
    const firstPayment = await createCapturedPayment({
      userId: user._id,
      paymentSuffix: "105",
    });

    const first = await activateSubscriptionForPayment(firstPayment._id);

    const secondPayment = await createCapturedPayment({
      userId: user._id,
      paymentSuffix: "106",
    });

    const second = await activateSubscriptionForPayment(secondPayment._id);

    const firstSubscription = await Subscription.findById(first.subscriptionId);
    const secondSubscription = await Subscription.findById(second.subscriptionId);

    expect(secondSubscription.status).toBe("pending");
    expect(secondSubscription.startsAt.getTime()).toBe(
      firstSubscription.endsAt.getTime(),
    );
    expect(secondSubscription.renewalOf.toString()).toBe(
      firstSubscription._id.toString(),
    );
  });

  it("expires old access and activates a queued renewal", async () => {
    const oldPayment = await createCapturedPayment({
      userId: user._id,
      paymentSuffix: "107",
    });

    const nextPayment = await createCapturedPayment({
      userId: user._id,
      paymentSuffix: "108",
    });

    const now = new Date();

    const oldStart = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const oldEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextEnd = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);

    const [oldSubscription] = await Subscription.create([
      {
        userId: user._id,
        paymentId: oldPayment._id,
        planId: "pro_monthly",
        tier: "pro",
        status: "active",
        startsAt: oldStart,
        endsAt: oldEnd,
        provider: "razorpay",
      },
      {
        userId: user._id,
        paymentId: nextPayment._id,
        planId: "pro_monthly",
        tier: "pro",
        status: "pending",
        startsAt: new Date(now.getTime() - 1000),
        endsAt: nextEnd,
        provider: "razorpay",
        renewalOf: oldPayment._id,
      },
    ]);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          subscription: {
            plan: "pro",
            status: "active",
            startsAt: oldStart,
            endsAt: oldEnd,
          },
        },
      },
    );

    const result = await processSubscriptionExpiries({ now });

    const expired = await Subscription.findById(oldSubscription._id);
    const queued = await Subscription.findOne({ paymentId: nextPayment._id });
    const savedUser = await User.findById(user._id);

    expect(result.expiredCount).toBe(1);
    expect(result.activatedCount).toBe(1);
    expect(expired.status).toBe("expired");
    expect(queued.status).toBe("active");
    expect(savedUser.subscription.status).toBe("active");
    expect(savedUser.subscription.endsAt.getTime()).toBe(nextEnd.getTime());
  });
});
