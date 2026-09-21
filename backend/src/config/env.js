import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().default(5000),

  MONGODB_URI: z.string().min(1),

  FRONTEND_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  OTP_EXPIRES_MINUTES: z.coerce.number().default(10),

  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  COOKIE_SAME_SITE: z
    .enum(["strict", "lax", "none"])
    .default("lax"),

  EMAIL_FROM: z.string().min(1),

  GMAIL_USER: z.string().email(),
  GMAIL_APP_PASSWORD: z.string().min(1),

  MIN_PASSWORD_LENGTH: z.coerce.number().default(8)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;