
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
import { sendSecurityOtp } from "../services/email.service.js";

let mongo;
let user;

const password = "StrongPass123!";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    User.init(),
    Session.init(),
    OtpChallenge.init(),
  ]);
}, 30000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
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
    passwordHash: await bcrypt.hash(password, 12),
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
  });
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongo) {
    await mongo.stop();
  }
});

describe("Password recovery", () => {
  it("accepts a password reset request for an existing account", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    expect(sendSecurityOtp).toHaveBeenCalledOnce();
    expect(sendSecurityOtp.mock.calls[0][0].purpose).toBe(
      "password_reset",
    );
  });

  it("returns a generic response for an unknown email", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "unknown@example.com" });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(sendSecurityOtp).not.toHaveBeenCalled();
  });

  it("resets the password and revokes existing sessions", async () => {
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({
        identifier: user.email,
        password,
      });

    expect(login.status).toBe(200);

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });

    const otp = sendSecurityOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: user.email,
        otp,
        newPassword: "AnotherStrongPass456!",
        confirmPassword: "AnotherStrongPass456!",
      });

    expect(response.status).toBe(200);

    const updatedUser = await User.findById(user._id).select(
      "+passwordHash",
    );

    expect(updatedUser).not.toBeNull();

    expect(
      await bcrypt.compare(
        "AnotherStrongPass456!",
        updatedUser.passwordHash,
      ),
    ).toBe(true);

    expect(
      await Session.countDocuments({
        user: user._id,
        revokedAt: null,
      }),
    ).toBe(0);

    const reusedOtp = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: user.email,
        otp,
        newPassword: "ThirdStrongPass789!",
        confirmPassword: "ThirdStrongPass789!",
      });

    expect(reusedOtp.status).toBe(400);
    expect(reusedOtp.body.error.code).toBe(
      "INVALID_OR_EXPIRED_OTP",
    );
  });

  it("rejects a wrong OTP", async () => {
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: user.email,
        otp: "999999",
        newPassword: "AnotherStrongPass456!",
        confirmPassword: "AnotherStrongPass456!",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_OR_EXPIRED_OTP");
  });

  it("rejects mismatched new passwords", async () => {
    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: user.email,
        otp: "123456",
        newPassword: "AnotherStrongPass456!",
        confirmPassword: "DifferentStrongPass789!",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an expired password-reset OTP", async () => {
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });

    const challenge = await OtpChallenge.findOne({
      email: user.email,
      purpose: "password_reset",
    });

    expect(challenge).not.toBeNull();

    challenge.expiresAt = new Date(Date.now() - 1000);
    await challenge.save();

    const otp = sendSecurityOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({
        email: user.email,
        otp,
        newPassword: "AnotherStrongPass456!",
        confirmPassword: "AnotherStrongPass456!",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_OR_EXPIRED_OTP");
  });
});
