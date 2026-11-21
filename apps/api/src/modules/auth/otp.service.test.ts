
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { EmailOtpModel } from "../../models/email-otp.model.js";
import { EmailVerificationGrantModel } from "../../models/email-verification-grant.model.js";

import {
  requestOtp,
  verifyOtp,
} from "./otp.service.js";

import { hashOtp } from "../../utils/otp.js";
import { sendEmail } from "../../config/mailer.js";

// Mock only external email delivery.
// MongoDB models and service logic remain real.
vi.mock("../../config/mailer.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

let mongoServer: MongoMemoryServer;

const TEST_EMAIL = "otp-test@example.com";
const TEST_OTP = "123456";

async function createOtpRecord(options?: {
  email?: string;
  code?: string;
  expiresAt?: Date;
  attempts?: number;
  consumedAt?: Date | null;
}) {
  const email = options?.email ?? TEST_EMAIL;
  const code = options?.code ?? TEST_OTP;

  return EmailOtpModel.create({
    email,
    purpose: "registration",
    codeHash: hashOtp(email, "registration", code),
    expiresAt:
      options?.expiresAt ??
      new Date(Date.now() + 10 * 60 * 1000),
    resendAvailableAt: new Date(Date.now() + 60 * 1000),
    attempts: options?.attempts ?? 0,
    consumedAt: options?.consumedAt ?? null,
  });
}

describe("OTP service security tests", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    await mongoose.connect(mongoServer.getUri());

    // Ensure unique and TTL indexes are created before testing.
    await EmailOtpModel.init();
    await EmailVerificationGrantModel.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmailOtpModel.deleteMany({});
    await EmailVerificationGrantModel.deleteMany({});

    vi.clearAllMocks();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
  });

  describe("requestOtp()", () => {
    it("creates an OTP record and sends an email", async () => {
      const result = await requestOtp(
        TEST_EMAIL,
        "registration",
      );

      const record = await EmailOtpModel.findOne({
        email: TEST_EMAIL,
        purpose: "registration",
      });

      expect(record).not.toBeNull();
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt).toBeNull();

      expect(result.expiresIn).toBe(600);
      expect(result.resendAvailableIn).toBe(60);

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("normalizes the email address", async () => {
      await requestOtp(
        "  USER@Example.com  ",
        "registration",
      );

      const record = await EmailOtpModel.findOne({
        email: "user@example.com",
      });

      expect(record).not.toBeNull();
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("rejects an invalid email address", async () => {
      await expect(
        requestOtp("invalid-email", "registration"),
      ).rejects.toThrow("Invalid email address.");

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("enforces the 60-second resend cooldown", async () => {
      await requestOtp(TEST_EMAIL, "registration");

      await expect(
        requestOtp(TEST_EMAIL, "registration"),
      ).rejects.toThrow(
        "Please wait before requesting another OTP.",
      );

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("allows a new OTP after the resend cooldown", async () => {
      await requestOtp(TEST_EMAIL, "registration");

      await EmailOtpModel.updateOne(
        {
          email: TEST_EMAIL,
          purpose: "registration",
        },
        {
          $set: {
            resendAvailableAt: new Date(Date.now() - 1000),
          },
        },
      );

      await requestOtp(TEST_EMAIL, "registration");

      const records = await EmailOtpModel.find({
        email: TEST_EMAIL,
        purpose: "registration",
      });

      expect(records).toHaveLength(1);
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("removes the OTP record when email delivery fails", async () => {
      vi.mocked(sendEmail).mockRejectedValueOnce(
        new Error("SMTP failure"),
      );

      await expect(
        requestOtp(TEST_EMAIL, "registration"),
      ).rejects.toThrow(
        "Unable to deliver the verification email.",
      );

      const record = await EmailOtpModel.findOne({
        email: TEST_EMAIL,
        purpose: "registration",
      });

      expect(record).toBeNull();
    });

    it("handles concurrent OTP requests without creating duplicate records", async () => {
      const results = await Promise.allSettled([
        requestOtp(TEST_EMAIL, "registration"),
        requestOtp(TEST_EMAIL, "registration"),
      ]);

      const successfulRequests = results.filter(
        (result) => result.status === "fulfilled",
      );

      const rejectedRequests = results.filter(
        (result) => result.status === "rejected",
      );

      const records = await EmailOtpModel.find({
        email: TEST_EMAIL,
        purpose: "registration",
      });

      expect(successfulRequests).toHaveLength(1);
      expect(rejectedRequests).toHaveLength(1);
      expect(records).toHaveLength(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("verifyOtp()", () => {
    it("accepts a valid OTP and issues a verification grant", async () => {
      await createOtpRecord();

      const result = await verifyOtp(
        TEST_EMAIL,
        "registration",
        TEST_OTP,
      );

      expect(result.verificationToken).toBeTruthy();
      expect(result.verificationToken).toHaveLength(43);
      expect(result.expiresIn).toBe(900);

      const otpRecord = await EmailOtpModel.findOne({
        email: TEST_EMAIL,
      });

      expect(otpRecord?.consumedAt).not.toBeNull();

      const grant = await EmailVerificationGrantModel.findOne({
        email: TEST_EMAIL,
        purpose: "registration",
      });

      expect(grant).not.toBeNull();
      expect(grant?.tokenHash).not.toBe(
        result.verificationToken,
      );
    });

    it("rejects an incorrect OTP and increments attempts", async () => {
      await createOtpRecord();

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          "654321",
        ),
      ).rejects.toThrow("Invalid verification code.");

      const record = await EmailOtpModel.findOne({
        email: TEST_EMAIL,
      });

      expect(record?.attempts).toBe(1);
    });

    it("rejects verification after five failed attempts", async () => {
      await createOtpRecord();

      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(
          verifyOtp(
            TEST_EMAIL,
            "registration",
            "654321",
          ),
        ).rejects.toThrow();
      }

      const record = await EmailOtpModel.findOne({
        email: TEST_EMAIL,
      });

      expect(record?.attempts).toBe(5);

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          TEST_OTP,
        ),
      ).rejects.toThrow("Invalid or expired verification code.");
    });

    it("rejects an expired OTP", async () => {
      await createOtpRecord({
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          TEST_OTP,
        ),
      ).rejects.toThrow("Invalid or expired verification code.");
    });

    it("rejects an already consumed OTP", async () => {
      await createOtpRecord({
        consumedAt: new Date(),
      });

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          TEST_OTP,
        ),
      ).rejects.toThrow("Invalid or expired verification code.");
    });

    it("rejects an OTP with malformed input", async () => {
      await createOtpRecord();

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          "12AB56",
        ),
      ).rejects.toThrow("Invalid or expired verification code.");
    });

    it("rejects replay of a successfully consumed OTP", async () => {
      await createOtpRecord();

      const firstVerification = await verifyOtp(
        TEST_EMAIL,
        "registration",
        TEST_OTP,
      );

      expect(firstVerification.verificationToken).toBeTruthy();

      await expect(
        verifyOtp(
          TEST_EMAIL,
          "registration",
          TEST_OTP,
        ),
      ).rejects.toThrow("Invalid or expired verification code.");

      const grants = await EmailVerificationGrantModel.find({
        email: TEST_EMAIL,
      });

      expect(grants).toHaveLength(1);
    });

    it("rejects a valid OTP belonging to another email", async () => {
      await createOtpRecord();

      await expect(
        verifyOtp(
          "another@example.com",
          "registration",
          TEST_OTP,
        ),
      ).rejects.toThrow("Invalid or expired verification code.");
    });
  });
});
