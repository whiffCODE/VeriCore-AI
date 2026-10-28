
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { User } from "../models/user.model.js";
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
  sendRegistrationOtp,
  sendWelcomeEmail,
} from "../services/email.service.js";

const BCRYPT_ROUNDS = 12;
const MAX_OTP_ATTEMPTS = 5;

function publicError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function registrationMessage() {
  return {
    success: true,
    message:
      "If the registration details are eligible, a verification code will be sent to the registered email address.",
  };
}

function registrationMessageResponse(res) {
  return res.status(202).json(registrationMessage());
}

function makeUserId() {
  const year = new Date().getFullYear();
  const suffix = randomBytes(5).toString("hex").toUpperCase();

  return `VC-${year}-${suffix}`;
}

export async function register(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      phone,
      age,
      email,
      password,
      guardianEmail,
      guardianPhone,
    } = req.validatedBody;

    const normalizedEmail = normalizeEmail(email);

    const existingUser = await User.exists({
      email: normalizedEmail,
    });

    if (existingUser) {
      return registrationMessageResponse(res);
    }

    const otp = generateOtp();

    const passwordHash = await bcrypt.hash(
      password,
      BCRYPT_ROUNDS,
    );

    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          firstName,
          lastName,
          phone,
          age,
          email: normalizedEmail,
          guardianEmail: guardianEmail
            ? normalizeEmail(guardianEmail)
            : undefined,
          guardianPhone,
          passwordHash,
          otpHash: hashOtp({
            email: normalizedEmail,
            purpose: "registration",
            otp,
          }),
          otpExpiresAt: otpExpiryDate(),
          otpAttempts: 0,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    try {
      await sendRegistrationOtp({
        email: normalizedEmail,
        firstName,
        otp,
      });
    } catch (error) {
      console.error(
        "Registration email delivery failed:",
        error.message,
      );

      return publicError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "We could not send your verification email. Please try again later.",
      );
    }

    return res.status(202).json(registrationMessage());
  } catch (error) {
    if (error?.code === 11000) {
      return registrationMessageResponse(res);
    }

    return next(error);
  }
}

export async function verifyRegistrationOtp(req, res, next) {
  try {
    const { email, otp } = req.validatedBody;
    const normalizedEmail = normalizeEmail(email);

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
    }).select("+otpHash +passwordHash");

    if (!pending) {
      return publicError(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired. Please register again or request a new code.",
      );
    }

    if (pending.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return publicError(
        res,
        429,
        "OTP_ATTEMPTS_EXCEEDED",
        "Too many verification attempts. Request a new code.",
      );
    }

    if (isOtpExpired(pending.otpExpiresAt)) {
      await PendingRegistration.deleteOne({
        _id: pending._id,
      });

      return publicError(
        res,
        400,
        "INVALID_OR_EXPIRED_OTP",
        "The verification code is invalid or expired. Please register again or request a new code.",
      );
    }

    // Save the attempt before validating the submitted OTP.
    pending.otpAttempts += 1;
    await pending.save();

    const validOtp = verifyOtp({
      email: normalizedEmail,
      purpose: "registration",
      otp,
      expectedHash: pending.otpHash,
    });

    if (!validOtp) {
      const attemptsExceeded =
        pending.otpAttempts >= MAX_OTP_ATTEMPTS;

      return publicError(
        res,
        attemptsExceeded ? 429 : 400,
        attemptsExceeded
          ? "OTP_ATTEMPTS_EXCEEDED"
          : "INVALID_OR_EXPIRED_OTP",
        attemptsExceeded
          ? "Too many verification attempts. Request a new code."
          : "The verification code is invalid or expired.",
      );
    }

    const userId = makeUserId();

    const user = await User.create({
      userId,
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      phone: pending.phone,
      age: pending.age,
      guardianEmail: pending.guardianEmail,
      guardianPhone: pending.guardianPhone,
      passwordHash: pending.passwordHash,
      emailVerifiedAt: new Date(),
      role: "user",
      status: "active",
    });

    await PendingRegistration.deleteOne({
      _id: pending._id,
    });

    // Email delivery must not undo a successfully created account.
    try {
      await sendWelcomeEmail({
        email: user.email,
        firstName: user.firstName,
        userId: user.userId,
      });
    } catch (error) {
      console.error(
        "Welcome email delivery failed:",
        error.message,
      );
    }

    return res.status(201).json({
      success: true,
      message:
        "Your email has been verified and your account is active.",
      user: {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        emailVerified: true,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return publicError(
        res,
        409,
        "REGISTRATION_CONFLICT",
        "This registration could not be completed. Please contact support if the issue persists.",
      );
    }

    return next(error);
  }
}

export async function resendRegistrationOtp(req, res, next) {
  try {
    const normalizedEmail = normalizeEmail(
      req.validatedBody.email,
    );

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
    });

    if (!pending) {
      return res.status(202).json({
        success: true,
        message:
          "If a pending registration exists, a new verification code will be sent.",
      });
    }

    const otp = generateOtp();

    pending.otpHash = hashOtp({
      email: normalizedEmail,
      purpose: "registration",
      otp,
    });

    pending.otpExpiresAt = otpExpiryDate();
    pending.otpAttempts = 0;

    await pending.save();

    try {
      await sendRegistrationOtp({
        email: normalizedEmail,
        firstName: pending.firstName,
        otp,
      });
    } catch (error) {
      console.error(
        "OTP resend email failed:",
        error.message,
      );

      return publicError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "We could not send the verification email. Please try again later.",
      );
    }

    return res.status(202).json({
      success: true,
      message:
        "If a pending registration exists, a new verification code will be sent.",
    });
  } catch (error) {
    return next(error);
  }
}
