import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { OtpChallenge } from "../models/OtpChallenge.js";
import {
  generateOtp,
  hashOtp
} from "../utils/otp.js";
import {
  generateUserId
} from "../utils/userId.js";
import {
  createAccessToken,
  createPasswordResetToken,
  createRefreshToken,
  createRegistrationSetupToken
} from "../utils/tokens.js";
import {
  sendParentAssuranceEmail,
  sendPasswordResetOtp,
  sendPasswordResetSuccess,
  sendRegistrationOtp,
  sendUserIdEmail
} from "./email.service.js";

import { validatePassword } from "../utils/password.js";

import { env } from "../config/env.js";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  return phone.replace(/\s+/g, "");
}

function isMinor(age) {
  return age <= 13;
}

async function createOtpChallenge(userId, purpose) {
  await OtpChallenge.deleteMany({
    userId,
    purpose
  });

  const otp = generateOtp();

  const otpHash = hashOtp(otp);

  const expiresAt = new Date(
    Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000
  );

  await OtpChallenge.create({
    userId,
    purpose,
    otpHash,
    expiresAt
  });

  return otp;
}

async function verifyOtpChallenge({
  userId,
  purpose,
  otp
}) {
  const challenge = await OtpChallenge.findOne({
    userId,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!challenge) {
    throw new Error("Invalid or expired OTP");
  }

  if (challenge.attempts >= 5) {
    throw new Error("Too many OTP attempts");
  }

  challenge.attempts += 1;

  const valid = challenge.otpHash === hashOtp(otp);

  if (!valid) {
    await challenge.save();
    throw new Error("Invalid or expired OTP");
  }

  challenge.consumedAt = new Date();

  await challenge.save();

  return true;
}

export async function registerUser(data) {
  const {
    firstName,
    lastName,
    phone,
    age,
    email,
    parentEmail,
    parentPhone
  } = data;

  const emailNormalized = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  const existing = await User.findOne({
    emailNormalized
  });

  if (existing && existing.status !== "PENDING_VERIFICATION") {
    throw new Error("Unable to complete registration");
  }

  if (isMinor(age) && !parentEmail && !parentPhone) {
    throw new Error(
      "Parent or guardian contact is required for users aged 13 or below"
    );
  }

  let user = existing;

  if (!user) {
    user = await User.create({
      firstName,
      lastName,
      phone: normalizedPhone,
      age,
      email,
      emailNormalized,
      parentEmail: parentEmail
        ? normalizeEmail(parentEmail)
        : null,
      parentPhone: parentPhone
        ? normalizePhone(parentPhone)
        : null,
      parentalAssuranceRequired: isMinor(age),
      parentalAssuranceStatus: isMinor(age)
        ? "PENDING"
        : "NOT_REQUIRED",
      userId: generateUserId(),
      status: "PENDING_VERIFICATION"
    });
  }

  const otp = await createOtpChallenge(
    user._id,
    "REGISTRATION"
  );

  await sendRegistrationOtp({
    to: user.email,
    firstName: user.firstName,
    otp
  });

  if (
    user.parentalAssuranceRequired &&
    user.parentEmail
  ) {
    await sendParentAssuranceEmail({
      to: user.parentEmail,
      childName: `${user.firstName} ${user.lastName}`
    });
  }

  return {
    message:
      "Registration initiated. A verification OTP has been sent to the registered email address."
  };
}

export async function resendRegistrationOtp(email) {
  const emailNormalized = normalizeEmail(email);

  const user = await User.findOne({
    emailNormalized,
    status: "PENDING_VERIFICATION"
  });

  if (!user) {
    return {
      message:
        "If the account exists and requires verification, a new OTP has been sent."
    };
  }

  const otp = await createOtpChallenge(
    user._id,
    "REGISTRATION"
  );

  await sendRegistrationOtp({
    to: user.email,
    firstName: user.firstName,
    otp
  });

  return {
    message:
      "If the account exists and requires verification, a new OTP has been sent."
  };
}

export async function verifyRegistrationOtp({
  email,
  otp
}) {
  const emailNormalized = normalizeEmail(email);

  const user = await User.findOne({
    emailNormalized,
    status: "PENDING_VERIFICATION"
  });

  if (!user) {
    throw new Error("Invalid or expired OTP");
  }

  await verifyOtpChallenge({
    userId: user._id,
    purpose: "REGISTRATION",
    otp
  });

  const setupToken =
    createRegistrationSetupToken(user);

  return {
    message: "Email verified successfully.",
    setupToken
  };
}

export async function setRegistrationPassword({
  setupToken,
  password
}) {
  const jwt = await import("jsonwebtoken");

  let payload;

  try {
    payload = jwt.default.verify(
      setupToken,
      env.JWT_ACCESS_SECRET
    );
  } catch {
    throw new Error(
      "Invalid or expired registration setup token"
    );
  }

  if (
    payload.purpose !==
    "REGISTRATION_PASSWORD_SETUP"
  ) {
    throw new Error(
      "Invalid registration setup token"
    );
  }

  const user = await User.findById(payload.sub);

  if (!user || user.status !== "PENDING_VERIFICATION") {
    throw new Error(
      "Unable to complete registration"
    );
  }

  validatePassword(password);

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  user.passwordHash = passwordHash;
  user.emailVerifiedAt = new Date();
  user.status = "ACTIVE";

  await user.save();

  await sendUserIdEmail({
    to: user.email,
    firstName: user.firstName,
    userId: user.userId
  });

  return {
    message: "Account created successfully.",
    userId: user.userId
  };
}

export async function loginUser({
  identifier,
  password
}) {
  const normalized = identifier.trim();

  const user = await User.findOne({
    $or: [
      {
        emailNormalized:
          normalizeEmail(normalized)
      },
      {
        userId: normalized.toUpperCase()
      }
    ]
  });

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !user.passwordHash
  ) {
    throw new Error(
      "Invalid user ID/email or password"
    );
  }

  const passwordMatches =
    await bcrypt.compare(
      password,
      user.passwordHash
    );

  if (!passwordMatches) {
    throw new Error(
      "Invalid user ID/email or password"
    );
  }

  user.lastLoginAt = new Date();

  await user.save();

  return {
    accessToken: createAccessToken(user),
    refreshToken: createRefreshToken(user),
    user: {
      id: user._id,
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      subscription: user.subscription
    }
  };
}

export async function requestPasswordReset(email) {
  const emailNormalized = normalizeEmail(email);

  const user = await User.findOne({
    emailNormalized,
    status: "ACTIVE"
  });

  if (user) {
    const otp = await createOtpChallenge(
      user._id,
      "FORGOT_PASSWORD"
    );

    await sendPasswordResetOtp({
      to: user.email,
      firstName: user.firstName,
      otp
    });
  }

  return {
    message:
      "If the email address is registered, a password reset OTP will be sent."
  };
}

export async function verifyPasswordResetOtp({
  email,
  otp
}) {
  const user = await User.findOne({
    emailNormalized: normalizeEmail(email),
    status: "ACTIVE"
  });

  if (!user) {
    throw new Error("Invalid or expired OTP");
  }

  await verifyOtpChallenge({
    userId: user._id,
    purpose: "FORGOT_PASSWORD",
    otp
  });

  return {
    resetToken: createPasswordResetToken(user)
  };
}

export async function resetPassword({
  resetToken,
  password
}) {
  const jwt = await import("jsonwebtoken");

  let payload;

  try {
    payload = jwt.default.verify(
      resetToken,
      env.JWT_ACCESS_SECRET
    );
  } catch {
    throw new Error(
      "Invalid or expired reset token"
    );
  }

  if (payload.purpose !== "PASSWORD_RESET") {
    throw new Error(
      "Invalid password reset token"
    );
  }

  const user = await User.findById(payload.sub);

  if (!user || user.status !== "ACTIVE") {
    throw new Error("Unable to reset password");
  }

  validatePassword(password);

  user.passwordHash =
    await bcrypt.hash(password, 12);

  user.passwordChangedAt = new Date();

  await user.save();

  await sendPasswordResetSuccess({
    to: user.email,
    firstName: user.firstName
  });

  return {
    message: "Password reset successfully."
  };
}

export async function getUserById(id) {
  return User.findById(id).select(
    "-passwordHash"
  );
}

export async function recoverUserId(email) {
  const user = await User.findOne({
    emailNormalized: normalizeEmail(email)
  });

  if (user) {
    await sendUserIdEmail({
      to: user.email,
      firstName: user.firstName,
      userId: user.userId
    });
  }

  return {
    message:
      "If the information matches an account, recovery instructions have been sent."
  };
}

export async function recoverEmail(userId) {
  const user = await User.findOne({
    userId: userId.trim().toUpperCase()
  });

  if (user) {
    await sendUserIdEmail({
      to: user.email,
      firstName: user.firstName,
      userId: user.userId
    });
  }

  return {
    message:
      "If the information matches an account, recovery instructions have been sent."
  };
}

export async function recoverBoth(phone) {
  const user = await User.findOne({
    phone: normalizePhone(phone)
  });

  if (user) {
    await sendUserIdEmail({
      to: user.email,
      firstName: user.firstName,
      userId: user.userId
    });
  }

  return {
    message:
      "If the information matches an account, recovery instructions have been sent."
  };
}