
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
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

vi.mock("../services/email.service.js", () => ({
  sendRegistrationOtp: vi.fn().mockResolvedValue({
    messageId: "test-otp",
  }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({
    messageId: "test-welcome",
  }),
}));

import { app } from "../app.js";
import {
  sendRegistrationOtp,
  sendWelcomeEmail,
} from "../services/email.service.js";
import { User } from "../models/user.model.js";
import { PendingRegistration } from "../models/pending-registration.model.js";
import { hashOtp } from "../services/otp.service.js";

let mongo;

const validRegistration = {
  firstName: "Aarav",
  lastName: "Sen",
  phone: "9876543210",
  age: 24,
  email: "aarav@example.com",
  password: "StrongPass123!",
  confirmPassword: "StrongPass123!",
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    User.init(),
    PendingRegistration.init(),
  ]);
}, 30000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    PendingRegistration.deleteMany({}),
  ]);

  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongo) {
    await mongo.stop();
  }
});

describe("Registration and email verification", () => {
  it("rejects mismatched passwords", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validRegistration,
        confirmPassword: "DifferentPass123!",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(sendRegistrationOtp).not.toHaveBeenCalled();
  });

  it("rejects applicants under 18 without guardian details", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validRegistration,
        age: 16,
      });

    expect(response.status).toBe(422);
  });

  it("creates a pending registration and sends an OTP", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    expect(sendRegistrationOtp).toHaveBeenCalledOnce();
    expect(sendRegistrationOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "aarav@example.com",
        firstName: "Aarav",
        otp: expect.stringMatching(/^\d{6}$/),
      }),
    );

    expect(await User.countDocuments()).toBe(0);
    expect(await PendingRegistration.countDocuments()).toBe(1);

    const pending = await PendingRegistration.findOne({
      email: "aarav@example.com",
    }).select("+otpHash +passwordHash");

    expect(pending.otpHash).not.toBe(
      sendRegistrationOtp.mock.calls[0][0].otp,
    );

    expect(pending.passwordHash).not.toBe(
      validRegistration.password,
    );
  });

  it("does not activate an account with an incorrect OTP", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    const response = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp: "000000",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_OR_EXPIRED_OTP");
    expect(await User.countDocuments()).toBe(0);
  });

  it("activates an account after a valid OTP and sends the user ID", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    const otp = sendRegistrationOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.user.emailVerified).toBe(true);

    expect(response.body.user.userId).toMatch(
      /^VC-\d{4}-[A-F0-9]{10}$/,
    );

    const user = await User.findOne({
      email: validRegistration.email,
    }).select("+passwordHash");

    expect(user).not.toBeNull();
    expect(user.passwordHash).not.toBe(validRegistration.password);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);

    expect(await PendingRegistration.countDocuments()).toBe(0);
    expect(sendWelcomeEmail).toHaveBeenCalledOnce();

    expect(sendWelcomeEmail.mock.calls[0][0].userId).toBe(
      response.body.user.userId,
    );
  });

  it("rejects expired OTPs", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    await PendingRegistration.updateOne(
      { email: validRegistration.email },
      {
        $set: {
          otpExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const otp = sendRegistrationOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_OR_EXPIRED_OTP");
    expect(await User.countDocuments()).toBe(0);
  });

  it("does not reveal a user ID or account details in the registration response", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    expect(response.status).toBe(202);
    expect(response.body.userId).toBeUndefined();

    expect(JSON.stringify(response.body)).not.toContain(
      validRegistration.password,
    );
  });

  it("resends a fresh OTP for an existing pending registration", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    const originalOtp = sendRegistrationOtp.mock.calls[0][0].otp;

    const response = await request(app)
      .post("/api/auth/resend-registration-otp")
      .send({
        email: validRegistration.email,
      });

    expect(response.status).toBe(202);
    expect(sendRegistrationOtp).toHaveBeenCalledTimes(2);

    const newOtp = sendRegistrationOtp.mock.calls[1][0].otp;

    expect(newOtp).toMatch(/^\d{6}$/);

    const pending = await PendingRegistration.findOne({
      email: validRegistration.email,
    }).select("+otpHash");

    expect(pending.otpAttempts).toBe(0);
    expect(pending.otpExpiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(pending.otpHash).not.toBe(
      hashOtp({
        email: validRegistration.email,
        purpose: "registration",
        otp: originalOtp,
      }),
    );

    expect(pending.otpHash).toBe(
      hashOtp({
        email: validRegistration.email,
        purpose: "registration",
        otp: newOtp,
      }),
    );

    const oldOtpResponse = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp: originalOtp,
      });

    expect(oldOtpResponse.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);

    const newOtpResponse = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp: newOtp,
      });

    expect(newOtpResponse.status).toBe(201);
    expect(await User.countDocuments()).toBe(1);
  });

  it("returns a generic response for an unknown resend email", async () => {
    const response = await request(app)
      .post("/api/auth/resend-registration-otp")
      .send({
        email: "unknown@example.com",
      });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(sendRegistrationOtp).not.toHaveBeenCalled();
  });

  it("locks OTP verification after five incorrect attempts", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validRegistration);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/verify-registration-otp")
        .send({
          email: validRegistration.email,
          otp: "999999",
        });

      expect([400, 429]).toContain(response.status);
    }

    const response = await request(app)
      .post("/api/auth/verify-registration-otp")
      .send({
        email: validRegistration.email,
        otp: sendRegistrationOtp.mock.calls[0][0].otp,
      });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("OTP_ATTEMPTS_EXCEEDED");
    expect(await User.countDocuments()).toBe(0);
  });
});
