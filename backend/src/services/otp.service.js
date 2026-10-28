
import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { env } from "../config/env.js";

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function generateOtp() {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

export function hashOtp({ email, purpose, otp }) {
  const normalizedEmail = normalizeEmail(email);

  return createHmac("sha256", env.OTP_HMAC_SECRET)
    .update(`${purpose}:${normalizedEmail}:${otp}`)
    .digest("hex");
}

export function verifyOtp({
  email,
  purpose,
  otp,
  expectedHash,
}) {
  if (
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp) ||
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash)
  ) {
    return false;
  }

  const actualHash = Buffer.from(
    hashOtp({ email, purpose, otp }),
    "hex",
  );

  const storedHash = Buffer.from(expectedHash, "hex");

  return (
    actualHash.length === storedHash.length &&
    timingSafeEqual(actualHash, storedHash)
  );
}

export function otpExpiryDate() {
  return new Date(
    Date.now() + env.OTP_TTL_MINUTES * 60 * 1000,
  );
}

export function isOtpExpired(expiresAt) {
  return !expiresAt || new Date(expiresAt).getTime() <= Date.now();
}
