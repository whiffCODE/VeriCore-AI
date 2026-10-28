
import { User } from "../models/user.model.js";
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
  sendRecoveryNotice,
  sendSecurityOtp,
} from "../services/email.service.js";

const MAX_ATTEMPTS = 5;

function genericRecoveryResponse(res) {
  return res.status(202).json({
    success: true,
    message:
      "If the details match an eligible account, recovery instructions will be sent to its registered email.",
  });
}

function publicError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

export async function recoverUserId(req, res, next) {
  try {
    const { email, phone } = req.validatedBody;

    const user = await User.findOne({
      ...(email ? { email: normalizeEmail(email) } : { phone }),
      emailVerifiedAt: { $ne: null },
      status: "active",
    });

    if (!user) {
      return genericRecoveryResponse(res);
    }

    try {
      await sendRecoveryNotice({
        email: user.email,
        firstName: user.firstName,
        subject: "Your VeriCore AI User ID",
        message:
          `Your User ID is ${user.userId}. You can use it with your password to log in. If you did not request this email, you can ignore it.`,
      });
    } catch (error) {
      console.error("User ID recovery email failed:", error.message);

      return publicError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "We could not send the recovery email. Please try again later.",
      );
    }

    return genericRecoveryResponse(res);
  } catch (error) {
    next(error);
  }
}

export async function requestEmailRecovery(req, res, next) {
  try {
    const userId = req.validatedBody.userId.toUpperCase();

    const user = await User.findOne({
      userId,
      emailVerifiedAt: { $ne: null },
      status: "active",
    });

    if (!user) {
      return genericRecoveryResponse(res);
    }

    const email = normalizeEmail(user.email);
    const otp = generateOtp();

    await OtpChallenge.findOneAndUpdate(
      { email, purpose: "email_recovery" },
      {
        $set: {
          email,
          purpose: "email_recovery",
          otpHash: hashOtp({
            email,
            purpose: "email_recovery",
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
        purpose: "email_recovery",
      });
    } catch (error) {
      console.error("Email recovery OTP delivery failed:", error.message);

      await OtpChallenge.deleteOne({
        email,
        purpose: "email_recovery",
      });

      return publicError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "We could not send the verification email. Please try again later.",
      );
    }

    return genericRecoveryResponse(res);
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailRecovery(req, res, next) {
  try {
    const userId = req.validatedBody.userId.toUpperCase();
    const { otp } = req.validatedBody;

    const user = await User.findOne({
      userId,
      emailVerifiedAt: { $ne: null },
      status: "active",
    });

    if (!user) {
      return publicError(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired.",
      );
    }

    const email = normalizeEmail(user.email);

    const challenge = await OtpChallenge.findOne({
      email,
      purpose: "email_recovery",
      consumedAt: null,
    }).select("+otpHash");

    if (
      !challenge ||
      isOtpExpired(challenge.expiresAt) ||
      challenge.attempts >= MAX_ATTEMPTS
    ) {
      return publicError(
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
        purpose: "email_recovery",
        otp,
        expectedHash: attempt.otpHash,
      })
    ) {
      return publicError(
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
      return publicError(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired.",
      );
    }

    return res.status(200).json({
      success: true,
      email: user.email,
      message: "Email recovery verified successfully.",
    });
  } catch (error) {
    next(error);
  }
}
