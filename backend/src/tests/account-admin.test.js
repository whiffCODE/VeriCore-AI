
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

vi.mock("../services/email.service.js", () => ({
  sendRegistrationOtp: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendSecurityOtp: vi.fn().mockResolvedValue({ messageId: "test" }),
  sendRecoveryNotice: vi.fn().mockResolvedValue({ messageId: "test" }),
}));

import { app } from "../app.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { OtpChallenge } from "../models/otp-challenge.model.js";
import { AuditLog } from "../models/audit-log.model.js";
import { sendSecurityOtp } from "../services/email.service.js";

let mongo;
let admin;
let regularUser;

const password = "StrongPass123!";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  await Promise.all([
    User.init(),
    Session.init(),
    OtpChallenge.init(),
    AuditLog.init(),
  ]);
}, 30000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
    OtpChallenge.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  vi.clearAllMocks();

  const passwordHash = await bcrypt.hash(password, 12);

  admin = await User.create({
    userId: "VC-2026-ADMIN123456",
    firstName: "Admin",
    lastName: "User",
    email: "admin@example.com",
    phone: "9876543210",
    age: 30,
    passwordHash,
    emailVerifiedAt: new Date(),
    role: "admin",
    status: "active",
  });

  regularUser = await User.create({
    userId: "VC-2026-USER123456",
    firstName: "Regular",
    lastName: "User",
    email: "regular@example.com",
    phone: "9876543211",
    age: 24,
    passwordHash,
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
  });
});

afterAll(async () => {
  try {
    await mongoose.disconnect();
  } finally {
    if (mongo) {
      await mongo.stop();
    }
  }
});

async function loginAgent(email) {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/auth/login")
    .send({
      identifier: email,
      password,
    });

  expect(response.status).toBe(200);

  return agent;
}

describe("Account management", () => {
  it("requires authentication to read account details", async () => {
    const response = await request(app).get("/api/account");

    expect(response.status).toBe(401);
  });

  it("returns account details without password hashes", async () => {
    const agent = await loginAgent(regularUser.email);

    const response = await agent.get("/api/account");

    expect(response.status).toBe(200);
    expect(response.body.account.email).toBe(regularUser.email);
    expect(response.body.account).not.toHaveProperty("passwordHash");
    expect(response.body.account).not.toHaveProperty("password");
  });

  it("requires the current password before sending a deletion OTP", async () => {
    const agent = await loginAgent(regularUser.email);

    const response = await agent
      .post("/api/account/deletion/request")
      .send({ password: "IncorrectPassword123!" });

    expect(response.status).toBe(401);
    expect(sendSecurityOtp).not.toHaveBeenCalled();
  });

  it("deletes the account only after OTP verification", async () => {
    const agent = await loginAgent(regularUser.email);

    const start = await agent
      .post("/api/account/deletion/request")
      .send({ password });

    expect(start.status).toBe(202);
    expect(await User.exists({ _id: regularUser._id })).not.toBeNull();

    const otp = sendSecurityOtp.mock.calls[0][0].otp;

    expect(otp).toMatch(/^\d{6}$/);

    const result = await agent
      .post("/api/account/deletion/confirm")
      .send({ otp });

    expect(result.status).toBe(200);
    expect(await User.exists({ _id: regularUser._id })).toBeNull();

    expect(
      await Session.countDocuments({ user: regularUser._id }),
    ).toBe(0);

    // The deleted account's OTP challenges should also be removed.
    expect(
      await OtpChallenge.countDocuments({
        email: regularUser.email,
      }),
    ).toBe(0);
  });

  it("does not delete an account when the OTP is incorrect", async () => {
    const agent = await loginAgent(regularUser.email);

    await agent
      .post("/api/account/deletion/request")
      .send({ password });

    const result = await agent
      .post("/api/account/deletion/confirm")
      .send({ otp: "999999" });

    expect(result.status).toBe(400);
    expect(await User.exists({ _id: regularUser._id })).not.toBeNull();
  });
});

describe("Admin authorization", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/admin/users");

    expect(response.status).toBe(401);
  });

  it("rejects ordinary users", async () => {
    const agent = await loginAgent(regularUser.email);

    const response = await agent.get("/api/admin/users");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_ACCESS_REQUIRED");
  });

  it("allows an admin to list users without exposing password hashes", async () => {
    const agent = await loginAgent(admin.email);

    const response = await agent.get("/api/admin/users");

    expect(response.status).toBe(200);
    expect(response.body.users.length).toBeGreaterThanOrEqual(2);

    for (const user of response.body.users) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("password");
    }
  });

  it("requires a reason before suspending a user", async () => {
    const agent = await loginAgent(admin.email);

    const response = await agent
      .patch(`/api/admin/users/${regularUser._id}/status`)
      .send({
        status: "suspended",
        reason: "Bad",
      });

    expect(response.status).toBe(422);
  });

  it("suspends a user, revokes sessions, and creates an audit record", async () => {
    const targetAgent = await loginAgent(regularUser.email);
    const adminAgent = await loginAgent(admin.email);

    const response = await adminAgent
      .patch(`/api/admin/users/${regularUser._id}/status`)
      .send({
        status: "suspended",
        reason:
          "Repeated attempts to access restricted corporate documents.",
      });

    expect(response.status).toBe(200);

    const updatedUser = await User.findById(regularUser._id);

    expect(updatedUser.status).toBe("suspended");

    expect(
      await Session.countDocuments({
        user: regularUser._id,
        revokedAt: null,
      }),
    ).toBe(0);

    expect(
      await AuditLog.countDocuments({
        actor: admin._id,
        target: regularUser._id,
        action: "user_suspended",
      }),
    ).toBe(1);

    const meResponse = await targetAgent.get("/api/auth/me");

    expect(meResponse.status).toBe(401);
  });

  it("prevents an administrator from changing their own role", async () => {
    const agent = await loginAgent(admin.email);

    const response = await agent
      .patch(`/api/admin/users/${admin._id}/role`)
      .send({
        role: "user",
        reason:
          "This is a test of the self-demotion restriction.",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "SELF_ROLE_CHANGE_NOT_ALLOWED",
    );
  });

  it("changes another user's role and records the reason", async () => {
    const agent = await loginAgent(admin.email);

    const reason =
      "Approved administrator appointment following security review.";

    const response = await agent
      .patch(`/api/admin/users/${regularUser._id}/role`)
      .send({
        role: "admin",
        reason,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("admin");

    const audit = await AuditLog.findOne({
      actor: admin._id,
      target: regularUser._id,
      action: "role_changed",
    });

    expect(audit).not.toBeNull();
    expect(audit.reason).toBe(reason);
    expect(audit.metadata.previousRole).toBe("user");
    expect(audit.metadata.newRole).toBe("admin");
  });
});
