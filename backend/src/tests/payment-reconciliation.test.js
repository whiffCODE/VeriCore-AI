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

const providerMocks = vi.hoisted(() => ({
  fetchRazorpayTransactions: vi.fn(),
  fetchStripeTransactions: vi.fn(),
}));

vi.mock("../services/reconciliation-provider.service.js", () => ({
  fetchRazorpayTransactions:
    providerMocks.fetchRazorpayTransactions,
  fetchStripeTransactions:
    providerMocks.fetchStripeTransactions,
}));

import { reconcileProviderPayments } from
  "../services/payment-reconciliation.service.js";

import { Payment } from "../models/payment.model.js";
import { ReconciliationRun } from
  "../models/reconciliation-run.model.js";
import { User } from "../models/user.model.js";

describe("payment reconciliation", () => {
  let mongoServer;
  let admin;

  const start = new Date("2026-10-30T00:00:00.000Z");
  const end = new Date("2026-10-31T00:00:00.000Z");

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    await mongoose.connect(mongoServer.getUri(), {
      serverSelectionTimeoutMS: 10_000,
    });

    if (mongoose.connection.readyState !== 1) {
      throw new Error(
        "Reconciliation test MongoDB connection was not established."
      );
    }

    await Promise.all([
      Payment.syncIndexes(),
      ReconciliationRun.syncIndexes(),
      User.syncIndexes(),
    ]);
  }, 30_000);

  beforeEach(async () => {
    vi.clearAllMocks();

    if (mongoose.connection.readyState !== 1) {
      throw new Error(
        "MongoDB is disconnected before reconciliation test setup."
      );
    }

    await Payment.deleteMany({});
    await ReconciliationRun.deleteMany({});
    await User.deleteMany({});

    admin = await User.create({
      firstName: "Billing",
      lastName: "Admin",
      email: "billing-admin@example.com",
      phone: "+919876543210",
      age: 30,
      passwordHash: "test-hash",
      emailVerifiedAt: new Date(),
      role: "admin",
      subscription: {
        plan: "free",
        status: "trial",
      },
    });
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } finally {
      await mongoServer?.stop();
    }
  }, 30_000);

  async function createCapturedPayment(overrides = {}) {
    return Payment.create({
      userId: admin._id,
      planId: "pro_monthly",
      tier: "pro",
      provider: "razorpay",
      amountPaise: 49999,
      currency: "INR",
      status: "captured",
      idempotencyKey: "reconciliation-test-001",
      providerOrderId: "order_test_123",
      providerPaymentId: "pay_test_123",
      createdAt: new Date("2026-10-30T10:00:00.000Z"),
      paidAt: new Date("2026-10-30T10:01:00.000Z"),
      ...overrides,
    });
  }

  function createProviderTransaction(overrides = {}) {
    return {
      provider: "razorpay",
      reference: "pay_test_123",
      amount: 49999,
      currency: "INR",
      status: "captured",
      captured: true,
      createdAt: new Date("2026-10-30T10:00:00.000Z"),
      ...overrides,
    };
  }

  async function runRazorpayReconciliation() {
    return reconcileProviderPayments({
      provider: "razorpay",
      start,
      end,
      startedBy: admin._id,
    });
  }

  it("reports a matching payment", async () => {
    await createCapturedPayment();

    providerMocks.fetchRazorpayTransactions.mockResolvedValue([
      createProviderTransaction(),
    ]);

    const run = await runRazorpayReconciliation();

    expect(run.status).toBe("completed");
    expect(run.summary.matchedCount).toBe(1);
    expect(run.summary.discrepancyCount).toBe(0);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0].type).toBe("matched");
  });

  it("detects an amount mismatch", async () => {
    await createCapturedPayment();

    providerMocks.fetchRazorpayTransactions.mockResolvedValue([
      createProviderTransaction({
        amount: 39999,
      }),
    ]);

    const run = await runRazorpayReconciliation();

    expect(run.status).toBe("completed");
    expect(run.summary.discrepancyCount).toBe(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0].type).toBe("amount_mismatch");
  });

  it("detects provider-only transactions", async () => {
    providerMocks.fetchRazorpayTransactions.mockResolvedValue([
      createProviderTransaction({
        reference: "pay_provider_only",
      }),
    ]);

    const run = await runRazorpayReconciliation();

    expect(run.status).toBe("completed");
    expect(run.summary.discrepancyCount).toBe(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0].type).toBe("provider_only");
  });

  it("detects local-only transactions", async () => {
    await createCapturedPayment();

    providerMocks.fetchRazorpayTransactions.mockResolvedValue([]);

    const run = await runRazorpayReconciliation();

    expect(run.status).toBe("completed");
    expect(run.summary.discrepancyCount).toBe(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0].type).toBe("local_only");
  });

  it("persists a reconciliation report", async () => {
    providerMocks.fetchRazorpayTransactions.mockResolvedValue([]);

    const run = await runRazorpayReconciliation();

    const stored = await ReconciliationRun.findById(run._id);

    expect(stored).not.toBeNull();
    expect(stored.status).toBe("completed");
    expect(stored.provider).toBe("razorpay");
  });

  it("rejects unsupported providers", async () => {
    await expect(
      reconcileProviderPayments({
        provider: "unsupported",
        start,
        end,
        startedBy: admin._id,
      })
    ).rejects.toThrow("Unsupported reconciliation provider");
  });
});

