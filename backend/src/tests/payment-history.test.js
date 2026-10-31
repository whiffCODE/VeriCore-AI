import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

import { app } from "../app.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { Payment } from "../models/payment.model.js";
import { Receipt } from "../models/receipt.model.js";

const password = "StrongPass123!";

describe("GET /api/billing/payments", () => {
  let mongoServer;
  let user;
  let otherUser;
  let agent;

  async function createTestUser(suffix = crypto.randomUUID()) {
    const passwordHash = await bcrypt.hash(password, 12);

    return User.create({
      firstName: "Test",
      lastName: "User",
      email: `test-${suffix}@example.com`,
      phone: `+9198${String(
        crypto.randomInt(10000000, 99999999)
      )}`,
      age: 25,
      passwordHash,
      emailVerifiedAt: new Date(),
      role: "user",
      status: "active",
      subscription: {
        plan: "free",
        status: "trial",
      },
    });
  }

  async function loginAgent(email) {
    const authenticatedAgent = request.agent(app);

    const response = await authenticatedAgent
      .post("/api/auth/login")
      .send({
        identifier: email,
        password,
      });

    expect(response.status).toBe(200);

    return authenticatedAgent;
  }

  async function createPayment({
    owner = user,
    status = "captured",
    provider = "razorpay",
    planId = "pro_monthly",
    amountPaise = 49900,
    currency = "INR",
    createdAt = new Date(),
    providerPaymentId,
  } = {}) {
    const isCaptured = status === "captured";

    return Payment.create({
      userId: owner._id,
      planId,
      tier: planId.startsWith("enterprise_")
        ? "enterprise"
        : "pro",
      provider,
      amountPaise,
      currency,
      status,
      idempotencyKey: `test_${crypto.randomUUID()}`,
      providerOrderId: `order_${crypto.randomUUID()}`,
      providerPaymentId:
        providerPaymentId ??
        (isCaptured ? `pay_${crypto.randomUUID()}` : undefined),
      paidAt: isCaptured ? createdAt : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  }

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 30000);

  beforeEach(async () => {
    await Promise.all([
      Payment.deleteMany({}),
      Receipt.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
    ]);

    user = await createTestUser();
    otherUser = await createTestUser();

    agent = await loginAgent(user.email);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  }, 30000);

  it("returns 401 when unauthenticated", async () => {
    const response = await request(app)
      .get("/api/billing/payments");

    expect(response.status).toBe(401);
  });

  it("returns an empty history when the user has no payments", async () => {
    const response = await agent
      .get("/api/billing/payments");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.pagination).toMatchObject({
      limit: 10,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("returns only the authenticated user's payments", async () => {
    const ownPayment = await createPayment({
      owner: user,
      providerPaymentId: "pay_own_payment",
    });

    await createPayment({
      owner: otherUser,
      providerPaymentId: "pay_other_user",
    });

    const response = await agent
      .get("/api/billing/payments");

    expect(response.status).toBe(200);

    const items = response.body.data.items;

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(ownPayment._id.toString());
    expect(items[0].providerPaymentId).toBe("pay_own_payment");
  });

  it("supports cursor-based pagination", async () => {
    const baseTime = new Date("2026-10-01T10:00:00.000Z");

    for (let index = 0; index < 3; index += 1) {
      await createPayment({
        createdAt: new Date(baseTime.getTime() + index * 1000),
        providerPaymentId: `pay_page_${index}`,
      });
    }

    const firstResponse = await agent
      .get("/api/billing/payments?limit=2");

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.items).toHaveLength(2);
    expect(firstResponse.body.data.pagination.hasMore).toBe(true);

    const cursor = firstResponse.body.data.pagination.nextCursor;

    expect(cursor).toEqual(expect.any(String));

    const secondResponse = await agent.get(
      `/api/billing/payments?limit=2&cursor=${encodeURIComponent(cursor)}`
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.items).toHaveLength(1);
    expect(secondResponse.body.data.pagination.hasMore).toBe(false);
    expect(secondResponse.body.data.pagination.nextCursor).toBeNull();

    const firstIds = firstResponse.body.data.items.map((item) => item.id);
    const secondIds = secondResponse.body.data.items.map((item) => item.id);

    expect(firstIds).not.toContain(secondIds[0]);
  });

  it("filters by payment status", async () => {
    await createPayment({ status: "captured" });

    await createPayment({
      status: "failed",
      providerPaymentId: undefined,
    });

    const response = await agent
      .get("/api/billing/payments?status=captured");

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].status).toBe("captured");
  });

  it("filters by payment provider", async () => {
    await createPayment({
      provider: "razorpay",
      providerPaymentId: "pay_razorpay_filter",
    });

    await createPayment({
      provider: "stripe",
      providerPaymentId: "pi_stripe_filter",
    });

    const response = await agent
      .get("/api/billing/payments?provider=stripe");

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].provider).toBe("stripe");
  });

  it("filters by date range", async () => {
    await createPayment({
      createdAt: new Date("2026-10-05T10:00:00.000Z"),
      providerPaymentId: "pay_before_range",
    });

    await createPayment({
      createdAt: new Date("2026-10-15T10:00:00.000Z"),
      providerPaymentId: "pay_inside_range",
    });

    await createPayment({
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
      providerPaymentId: "pay_after_range",
    });

    const response = await agent.get(
      "/api/billing/payments?from=2026-10-10T00:00:00.000Z&to=2026-10-20T23:59:59.999Z"
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].providerPaymentId).toBe(
      "pay_inside_range"
    );
  });

  it("rejects an invalid cursor", async () => {
    const response = await agent
      .get("/api/billing/payments?cursor=not-a-valid-cursor");

    expect(response.status).toBe(400);
  });

  it("rejects an invalid status filter", async () => {
    const response = await agent
      .get("/api/billing/payments?status=unknown");

    expect(response.status).toBe(400);
  });

  it("rejects an invalid provider filter", async () => {
    const response = await agent
      .get("/api/billing/payments?provider=unknown");

    expect(response.status).toBe(400);
  });

  it("rejects an invalid date range", async () => {
    const response = await agent
      .get("/api/billing/payments?from=2026-10-20&to=2026-10-10");

    expect(response.status).toBe(400);
  });

  it("rejects a limit above the maximum", async () => {
    const response = await agent
      .get("/api/billing/payments?limit=100");

    expect(response.status).toBe(400);
  });

  it("rejects a non-integer limit", async () => {
    const response = await agent
      .get("/api/billing/payments?limit=2.5");

    expect(response.status).toBe(400);
  });
});
