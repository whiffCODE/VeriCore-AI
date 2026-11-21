
import { z } from "zod";

// --------------------------------------------------
// Registration
// --------------------------------------------------

export const registerSchema = z.object({
  name: z.string()
    .trim()
    .min(2)
    .max(100),

  email: z.string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),

  password: z.string()
    .min(12)
    .max(128),

  organisationName: z.string()
    .trim()
    .min(2)
    .max(150),

  verificationToken: z.string()
    .min(40)
    .max(100),
});

// --------------------------------------------------
// Login
// --------------------------------------------------

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),

  password: z.string()
    .min(1)
    .max(128),
});

// --------------------------------------------------
// OTP request
// --------------------------------------------------

export const otpRequestSchema = z.object({
  email: z.string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),

  purpose: z.literal("registration"),
});

// --------------------------------------------------
// OTP verification
// --------------------------------------------------

export const otpVerifySchema = z.object({
  email: z.string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),

  purpose: z.literal("registration"),

  code: z.string()
    .regex(/^\d{6}$/, "OTP must contain exactly 6 digits."),
});

// --------------------------------------------------
// Types
// --------------------------------------------------

export type RegisterInput = z.infer<
  typeof registerSchema
>;

export type LoginInput = z.infer<
  typeof loginSchema
>;

export type OtpRequestInput = z.infer<
  typeof otpRequestSchema
>;

export type OtpVerifyInput = z.infer<
  typeof otpVerifySchema
>;
