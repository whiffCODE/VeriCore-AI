
import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { OtpChallenge } from "../models/otp-challenge.model.js";

import {
  generateOtp,
  hashOtp,
  isOtpExpired,
  normalizeEmail,
  otpExpiryDate,
  verifyOtp,
} from "../services/otp.service.js";

import {
  sendSecurityOtp,
  sendRecoveryNotice,
} from "../services/email.service.js";

import { revokeAllSessions } from "../services/session.service.js";

const MAX_ATTEMPTS = 5;
const GENERIC_RESET_MESSAGE =
  "If an eligible account exists, password recovery instructions will be sent to its registered email.";

function failure(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

async function issueChallenge({ user, purpose }) {
  const otp = generateOtp();
  const email = normalizeEmail(user.email);

  await OtpChallenge.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        email,
        purpose,
        otpHash: hashOtp({ email, purpose, otp }),
        expiresAt: otpExpiryDate(),
        attempts: 0,
        consumedAt: null,
        lastSentAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  try {
    await sendSecurityOtp({
      email,
      firstName: user.firstName,
      otp,
      purpose,
    });
  } catch (error) {
    console.error("Security email delivery failed:", error.message);

    // Invalidate the challenge if email delivery fails.
    await OtpChallenge.deleteOne({ email, purpose });

    throw new Error("SECURITY_EMAIL_DELIVERY_FAILED");
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.validatedBody.email);

    const user = await User.findOne({
      email,
      status: "active",
      emailVerifiedAt: { $ne: null },
    });

    if (user) {
      try {
        await issueChallenge({
          user,
          purpose: "password_reset",
        });
      } catch (error) {
        if (error.message === "SECURITY_EMAIL_DELIVERY_FAILED") {
          return failure(
            res,
            503,
            "EMAIL_DELIVERY_FAILED",
            "Recovery email delivery failed. Please try again later.",
          );
        }

        throw error;
      }
    }

    return res.status(202).json({
      success: true,
      message: GENERIC_RESET_MESSAGE,
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const {
      email: submittedEmail,
      otp,
      newPassword,
    } = req.validatedBody;

    const email = normalizeEmail(submittedEmail);

    const challenge = await OtpChallenge.findOne({
      email,
      purpose: "password_reset",
      consumedAt: null,
    }).select("+otpHash");

    if (!challenge || isOtpExpired(challenge.expiresAt)) {
      return failure(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The code is invalid or expired. Request a new password-reset code.",
      );
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      return failure(
        res,
        429,
        "OTP_ATTEMPTS_EXCEEDED",
        "Too many attempts. Request a new password-reset code.",
      );
    }

    // Persist the attempt before checking the submitted code.
    const attempt = await OtpChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: MAX_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { new: true },
    ).select("+otpHash");

    if (!attempt) {
      return failure(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The code is invalid or expired. Request a new password-reset code.",
      );
    }

    const valid = verifyOtp({
      email,
      purpose: "password_reset",
      otp,
      expectedHash: attempt.otpHash,
    });

    if (!valid) {
      return failure(
        res,
        attempt.attempts >= MAX_ATTEMPTS ? 429 : 400,
        attempt.attempts >= MAX_ATTEMPTS
          ? "OTP_ATTEMPTS_EXCEEDED"
          : "INVALID_OR_EXPIRED_OTP",
        "The code is invalid or expired. Request a new password-reset code.",
      );
    }

    // Atomically consume the challenge so the same OTP cannot reset
    // the password twice.
    const consumed = await OtpChallenge.findOneAndUpdate(
      {
        _id: attempt._id,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        attempts: { $lte: MAX_ATTEMPTS },
      },
      { $set: { consumedAt: new Date() } },
      { new: true },
    );

    if (!consumed) {
      return failure(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The code is invalid or expired. Request a new password-reset code.",
      );
    }

    const user = await User.findOne({
      email,
      status: "active",
      emailVerifiedAt: { $ne: null },
    });

    if (!user) {
      return failure(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The code is invalid or expired. Request a new password-reset code.",
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    await Promise.all([
      revokeAllSessions(user._id),
      Session.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      ),
      OtpChallenge.deleteMany({
        email,
        purpose: "password_reset",
      }),
    ]);

    try {
      await sendRecoveryNotice({
        email,
        firstName: user.firstName,
        subject: "Your password has been changed",
        message:
          "Your VeriCore AI password was changed successfully. All active sessions were revoked. If you did not make this change, contact support immediately.",
      });
    } catch (error) {
      console.error("Password-change notification failed:", error.message);
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in again.",
    });
  } catch (error) {
    next(error);
  }
}
