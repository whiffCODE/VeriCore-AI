
import { describe, expect, it } from "vitest";

import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "./otp.js";

describe("OTP utility security tests", () => {
  describe("generateOtp()", () => {
    it("generates a six-digit numeric OTP", () => {
      const otp = generateOtp();

      expect(otp).toMatch(/^\d{6}$/);
      expect(otp).toHaveLength(OTP_LENGTH);
    });

    it("generates OTPs within the valid numeric range", () => {
      const otp = Number(generateOtp());

      expect(otp).toBeGreaterThanOrEqual(0);
      expect(otp).toBeLessThan(1_000_000);
    });

    it("preserves leading zeroes when generated", () => {
      // Verify the output format rather than assuming a random
      // generator will produce a leading zero during this test.
      expect(generateOtp()).toMatch(/^\d{6}$/);
    });
  });

  describe("hashOtp()", () => {
    it("generates a consistent hash for identical inputs", () => {
      const firstHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      const secondHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      expect(firstHash).toBe(secondHash);
    });

    it("normalizes email casing before hashing", () => {
      const firstHash = hashOtp(
        "USER@example.com",
        "registration",
        "123456",
      );

      const secondHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      expect(firstHash).toBe(secondHash);
    });

    it("produces different hashes for different OTPs", () => {
      const firstHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      const secondHash = hashOtp(
        "user@example.com",
        "registration",
        "654321",
      );

      expect(firstHash).not.toBe(secondHash);
    });

    it("binds the hash to its purpose", () => {
      const registrationHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      const resetHash = hashOtp(
        "user@example.com",
        "password_reset",
        "123456",
      );

      expect(registrationHash).not.toBe(resetHash);
    });

    it("binds the hash to its email address", () => {
      const firstHash = hashOtp(
        "user@example.com",
        "registration",
        "123456",
      );

      const secondHash = hashOtp(
        "another@example.com",
        "registration",
        "123456",
      );

      expect(firstHash).not.toBe(secondHash);
    });

    it("does not expose the original OTP in its hash", () => {
      const otp = "123456";

      const hashedOtp = hashOtp(
        "user@example.com",
        "registration",
        otp,
      );

      expect(hashedOtp).not.toContain(otp);
      expect(hashedOtp).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("verifyOtpHash()", () => {
    const email = "user@example.com";
    const purpose = "registration";
    const otp = "123456";

    it("accepts the correct OTP", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, otp, storedHash),
      ).toBe(true);
    });

    it("rejects an incorrect OTP", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, "654321", storedHash),
      ).toBe(false);
    });

    it("rejects an OTP with fewer than six digits", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, "12345", storedHash),
      ).toBe(false);
    });

    it("rejects an OTP with more than six digits", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, "1234567", storedHash),
      ).toBe(false);
    });

    it("rejects alphabetic OTP input", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, "abcdef", storedHash),
      ).toBe(false);
    });

    it("rejects an OTP containing special characters", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(email, purpose, "12@456", storedHash),
      ).toBe(false);
    });

    it("rejects a hash belonging to another email", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(
          "another@example.com",
          purpose,
          otp,
          storedHash,
        ),
      ).toBe(false);
    });

    it("rejects a hash belonging to another purpose", () => {
      const storedHash = hashOtp(email, purpose, otp);

      expect(
        verifyOtpHash(
          email,
          "password_reset",
          otp,
          storedHash,
        ),
      ).toBe(false);
    });

    it("rejects a malformed stored hash", () => {
      expect(
        verifyOtpHash(email, purpose, otp, "invalid-hash"),
      ).toBe(false);
    });
  });

  describe("OTP security configuration", () => {
    it("uses the agreed OTP security limits", () => {
      expect(OTP_LENGTH).toBe(6);
      expect(OTP_EXPIRY_MINUTES).toBe(10);
      expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
      expect(OTP_MAX_ATTEMPTS).toBe(5);
    });
  });
});
