
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.");

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(72, "Password must not exceed 72 UTF-8 bytes.")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes.",
  );

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: phoneSchema,
    age: z.coerce.number().int().min(13).max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    guardianEmail: emailSchema.optional(),
    guardianPhone: phoneSchema.optional(),
  })
  .superRefine((data, context) => {
    if (data.password !== data.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }

    if (data.age < 18) {
      if (!data.guardianEmail || !data.guardianPhone) {
        context.addIssue({
          code: "custom",
          path: ["guardianEmail"],
          message:
            "A parent or guardian email and phone number are required for applicants under 18.",
        });
      }

      if (
        data.guardianEmail &&
        data.guardianEmail === data.email
      ) {
        context.addIssue({
          code: "custom",
          path: ["guardianEmail"],
          message:
            "The guardian email must be different from the applicant's email.",
        });
      }
    }
  });

export const verifyRegistrationOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP."),
});

export const resendRegistrationOtpSchema = z.object({
  email: emailSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
});
