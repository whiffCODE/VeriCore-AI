
import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { env } from "../config/env.js";

// --------------------------------------------------
// OTP configuration
// --------------------------------------------------

export const OTP_LENGTH = 6;

export const OTP_EXPIRY_MINUTES = 10;

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export const OTP_MAX_ATTEMPTS = 5;

// --------------------------------------------------
// Generate cryptographically secure OTP
// --------------------------------------------------

export function generateOtp(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

// --------------------------------------------------
// Create keyed OTP hash
// --------------------------------------------------

export function hashOtp(
  email: string,
  purpose: string,
  code: string,
): string {
  return createHmac("sha256", env.OTP_SECRET)
    .update(`${email.toLowerCase()}:${purpose}:${code}`)
    .digest("hex");
}

// --------------------------------------------------
// Verify OTP hash safely
// --------------------------------------------------

export function verifyOtpHash(
  email: string,
  purpose: string,
  code: string,
  storedHash: string,
): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const calculatedHash = hashOtp(
    email,
    purpose,
    code,
  );

  const calculatedBuffer = Buffer.from(
    calculatedHash,
    "hex",
  );

  const storedBuffer = Buffer.from(
    storedHash,
    "hex",
  );

  if (
    calculatedBuffer.length !== storedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    calculatedBuffer,
    storedBuffer,
  );
}
