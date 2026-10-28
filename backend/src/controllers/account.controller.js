
import bcrypt from "bcryptjs";

import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { OtpChallenge } from "../models/otp-challenge.model.js";
import { PendingRegistration } from "../models/pending-registration.model.js";

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

import {
  clearSessionCookies,
  revokeAllSessions,
} from "../services/session.service.js";

const MAX_ATTEMPTS = 5;

function errorResponse(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

export async function getAccount(req, res) {
  const user = req.user;

  const activeSessions = await Session.find({
    user: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("createdAt lastUsedAt expiresAt userAgent")
    .sort({ lastUsedAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    account: {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      phone: user.phone,
      age: user.age,
      role: user.role,
      status: user.status,
      subscription: user.subscription,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      activeSessions: activeSessions.map((session) => ({
        id: session._id.toString(),
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
      })),
    },
  });
}

export async function requestAccountDeletion(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select(
      "+passwordHash",
    );

    if (
      !user ||
      !(await bcrypt.compare(
        req.validatedBody.password,
        user.passwordHash,
      ))
    ) {
      return errorResponse(
        res,
        401,
        "INVALID_CREDENTIALS",
        "The password is incorrect.",
      );
    }

    const email = normalizeEmail(user.email);
    const otp = generateOtp();

    await OtpChallenge.findOneAndUpdate(
      { email, purpose: "account_deletion" },
      {
        $set: {
          email,
          purpose: "account_deletion",
          otpHash: hashOtp({
            email,
            purpose: "account_deletion",
            otp,
          }),
          expiresAt: otpExpiryDate(),
          attempts: 0,
          consumedAt: null,
          lastSentAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    try {
      await sendSecurityOtp({
        email,
        firstName: user.firstName,
        otp,
        purpose: "account_deletion",
      });
    } catch (error) {
      console.error("Account deletion email failed:", error.message);

      await OtpChallenge.deleteOne({
        email,
        purpose: "account_deletion",
      });

      return errorResponse(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "We could not send the verification email. Please try again later.",
      );
    }

    return res.status(202).json({
      success: true,
      message:
        "A verification code has been sent to your registered email. Your account has not been deleted.",
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmAccountDeletion(req, res, next) {
  try {
    const user = await User.findById(req.user._id);

    if (!user || user.status !== "active") {
      return errorResponse(
        res,
        404,
        "ACCOUNT_NOT_FOUND",
        "The account is no longer available.",
      );
    }

    const email = normalizeEmail(user.email);

    const challenge = await OtpChallenge.findOne({
      email,
      purpose: "account_deletion",
      consumedAt: null,
    }).select("+otpHash");

    if (
      !challenge ||
      isOtpExpired(challenge.expiresAt) ||
      challenge.attempts >= MAX_ATTEMPTS
    ) {
      return errorResponse(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired.",
      );
    }

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

    if (
      !attempt ||
      !verifyOtp({
        email,
        purpose: "account_deletion",
        otp: req.validatedBody.otp,
        expectedHash: attempt.otpHash,
      })
    ) {
      return errorResponse(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired.",
      );
    }

    const consumed = await OtpChallenge.findOneAndUpdate(
      {
        _id: attempt._id,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
      { new: true },
    );

    if (!consumed) {
      return errorResponse(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired.",
      );
    }

    const userEmail = user.email;
    const firstName = user.firstName;
    const userId = user._id;

    // Revoke sessions before deleting the account.
    await revokeAllSessions(userId);

    // Related document and billing cleanup will be integrated when
    // those models are implemented in later project phases.
    await Promise.all([
      Session.deleteMany({ user: userId }),
      PendingRegistration.deleteMany({ email }),
      OtpChallenge.deleteMany({ email }),
      User.deleteOne({ _id: userId }),
    ]);

    clearSessionCookies(res);

    try {
      await sendRecoveryNotice({
        email: userEmail,
        firstName,
        subject: "VeriCore AI account deletion confirmed",
        message:
          "Your account deletion request was verified and your account has been deleted. Some records may be retained where required by law or for legitimate security and financial recordkeeping.",
      });
    } catch (error) {
      console.error("Account deletion email failed:", error.message);
    }

    return res.status(200).json({
      success: true,
      message: "Your account has been deleted.",
    });
  } catch (error) {
    next(error);
  }
}
