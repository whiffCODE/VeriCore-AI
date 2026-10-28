
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
import { OtpChallenge } from "../models/otp-challenge.model.js";
import { sendSecurityOtp, sendRecoveryNotice } from "../services/email.service.js";

let mongo;
let user;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  await Promise.all([
    User.init(),
    OtpChallenge.init(),
  ]);
}, 30000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    OtpChallenge.deleteMany({}),
  ]);

  vi.clearAllMocks();

  user = await User.create({
    userId: "VC-2026-ABCDEF1234",
    firstName: "Aarav",
    lastName: "Sen",
    email: "aarav@example.com",
    phone: "9876543210",
    age: 24,
    passwordHash: await bcrypt.hash("StrongPass123!", 12),
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe("Identity recovery", () => {
  it("sends a user ID recovery email without exposing the ID in the response", async () => {
    const response = await request(app)
      .post("/api/auth/recover-user-id")
      .send({ email: user.email });

    expect(response.status).toBe(202);
    expect(response.body.message).not.toContain(user.userId);
    expect(sendRecoveryNotice).toHaveBeenCalledOnce();
  });

  it("can locate the account by phone and send recovery to the registered email", async () => {
    const response = await request(app)
      .post("/api/auth/recover-user-id")
      .send({ phone: user.phone });

    expect(response.status).toBe(202);
    expect(sendRecoveryNotice.mock.calls[0][0].email).toBe(user.email);
  });

  it("returns the same generic response for an unknown account", async () => {
    const response = await request(app)
      .post("/api/auth/recover-user-id")
      .send({ email: "unknown@example.com" });

    expect(response.status).toBe(202);
    expect(sendRecoveryNotice).not.toHaveBeenCalled();
  });

  it("reveals the email only after a valid recovery OTP", async () => {
    const start = await request(app)
      .post("/api/auth/recover-email")
      .send({ userId: user.userId });

    expect(start.status).toBe(202);

    const otp = sendSecurityOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/verify-email-recovery")
      .send({
        userId: user.userId,
        otp,
      });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(user.email);

    const reused = await request(app)
      .post("/api/auth/verify-email-recovery")
      .send({
        userId: user.userId,
        otp,
      });

    expect(reused.status).toBe(400);
  });

  it("rejects a wrong recovery OTP", async () => {
    await request(app)
      .post("/api/auth/recover-email")
      .send({ userId: user.userId });

    const response = await request(app)
      .post("/api/auth/verify-email-recovery")
      .send({
        userId: user.userId,
        otp: "999999",
      });

    expect(response.status).toBe(400);
  });
});
