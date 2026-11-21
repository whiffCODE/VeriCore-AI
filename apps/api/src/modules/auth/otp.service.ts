
import { randomBytes, createHash } from "node:crypto";

import { EmailOtpModel } from "../../models/email-otp.model.js";
import { EmailVerificationGrantModel } from "../../models/email-verification-grant.model.js";
import { UserModel } from "../../models/user.model.js";

import type { OtpPurpose } from "../../models/email-otp.model.js";

import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "../../utils/otp.js";

import { sendEmail } from "../../config/mailer.js";
import { createOtpEmailTemplate } from "./email-templates.js";
import { AppError } from "../../utils/app-error.js";

// --------------------------------------------------
// Constants
// --------------------------------------------------

const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

const OTP_COOLDOWN_MS =
  OTP_RESEND_COOLDOWN_SECONDS * 1000;

const REGISTRATION_GRANT_MINUTES = 15;

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashVerificationGrant(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// --------------------------------------------------
// Request OTP
// --------------------------------------------------

export async function requestOtp(
  email: string,
  purpose: OtpPurpose,
): Promise<{
  expiresIn: number;
  resendAvailableIn: number;
}> {
  const normalizedEmail = normalizeEmail(email);

  if (
    !normalizedEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new AppError(400, "Invalid email address.");
  }

  // Registration OTPs are only for addresses
  // that do not already have an account.
  if (purpose === "registration") {
    const existingUser = await UserModel.exists({
      email: normalizedEmail,
    });

    if (existingUser) {
      // Do not disclose account existence here.
      return {
        expiresIn: OTP_EXPIRY_MINUTES * 60,
        resendAvailableIn: OTP_RESEND_COOLDOWN_SECONDS,
      };
    }
  }

  const now = new Date();
  const code = generateOtp();

  const codeHash = hashOtp(
    normalizedEmail,
    purpose,
    code,
  );

  const expiresAt = new Date(
    now.getTime() + OTP_EXPIRY_MS,
  );

  const resendAvailableAt = new Date(
    now.getTime() + OTP_COOLDOWN_MS,
  );

  // Atomically claim the resend window.
  const updatedOtp = await EmailOtpModel.findOneAndUpdate(
    {
  email: normalizedEmail,
  purpose,
  resendAvailableAt: { $lte: now },
},
    {
      $set: {
        codeHash,
        expiresAt,
        resendAvailableAt,
        attempts: 0,
        consumedAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  let otpRecordId: string;

  if (updatedOtp) {
    otpRecordId = updatedOtp._id.toString();
  } else {
    try {
      const createdOtp = await EmailOtpModel.create({
        email: normalizedEmail,
        purpose,
        codeHash,
        expiresAt,
        resendAvailableAt,
        attempts: 0,
        consumedAt: null,
      });

      otpRecordId = createdOtp._id.toString();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          429,
          "Please wait before requesting another OTP.",
        );
      }

      throw error;
    }
  }

  const template = createOtpEmailTemplate({
    code,
    purpose,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  } catch {
    await EmailOtpModel.deleteOne({
      _id: otpRecordId,
      codeHash,
    });

    throw new AppError(
      503,
      "Unable to deliver the verification email. Please try again.",
    );
  }

  return {
    expiresIn: OTP_EXPIRY_MINUTES * 60,
    resendAvailableIn: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

// --------------------------------------------------
// Verify OTP and issue registration grant
// --------------------------------------------------

export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string,
): Promise<{
  verificationToken: string;
  expiresIn: number;
}> {
  const normalizedEmail = normalizeEmail(email);

  if (!/^\d{6}$/.test(code)) {
    throw new AppError(
      400,
      "Invalid or expired verification code.",
    );
  }

  const now = new Date();

  const otpRecord = await EmailOtpModel.findOne({
    email: normalizedEmail,
    purpose,
  }).select("+codeHash");

  if (
    !otpRecord ||
    otpRecord.consumedAt ||
    otpRecord.expiresAt.getTime() <= now.getTime() ||
    otpRecord.attempts >= OTP_MAX_ATTEMPTS
  ) {
    throw new AppError(
      400,
      "Invalid or expired verification code.",
    );
  }

  const isValid = verifyOtpHash(
    normalizedEmail,
    purpose,
    code,
    otpRecord.codeHash,
  );

  if (!isValid) {
    const attemptUpdate = await EmailOtpModel.updateOne(
      {
        _id: otpRecord._id,
        consumedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: OTP_MAX_ATTEMPTS },
        codeHash: otpRecord.codeHash,
      },
      {
        $inc: { attempts: 1 },
      },
    );

    if (attemptUpdate.modifiedCount === 0) {
      throw new AppError(
        400,
        "Invalid or expired verification code.",
      );
    }

    throw new AppError(
      400,
      "Invalid verification code.",
    );
  }

  // Atomically consume the OTP.
  const consumedOtp = await EmailOtpModel.findOneAndUpdate(
    {
      _id: otpRecord._id,
      codeHash: otpRecord.codeHash,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    },
    {
      $set: { consumedAt: now },
    },
    {
      new: true,
    },
  );

  if (!consumedOtp) {
    throw new AppError(
      400,
      "Invalid or expired verification code.",
    );
  }

  // Only registration grants are implemented in this milestone.
  if (purpose !== "registration") {
    throw new AppError(
      400,
      "This verification purpose is not available yet.",
    );
  }

  // Issue a random, short-lived registration grant.
  const verificationToken = randomBytes(32).toString(
    "base64url",
  );

  const expiresAt = new Date(
    Date.now() + REGISTRATION_GRANT_MINUTES * 60 * 1000,
  );

  try {
    await EmailVerificationGrantModel.create({
      email: normalizedEmail,
      purpose: "registration",
      tokenHash: hashVerificationGrant(verificationToken),
      expiresAt,
    });
  } catch {
    throw new AppError(
      503,
      "Unable to complete email verification. Please request a new code.",
    );
  }

  return {
    verificationToken,
    expiresIn: REGISTRATION_GRANT_MINUTES * 60,
  };
}
