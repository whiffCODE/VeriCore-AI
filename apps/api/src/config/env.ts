
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;

// --------------------------------------------------
// MongoDB configuration
// --------------------------------------------------

if (!mongoUri) {
  throw new Error("MONGODB_URI is not configured.");
}

// --------------------------------------------------
// JWT configuration
// --------------------------------------------------

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must contain at least 32 characters.",
  );
}

// --------------------------------------------------
// OTP security configuration
// --------------------------------------------------

const otpSecret = process.env.OTP_SECRET;

if (!otpSecret || otpSecret.length < 32) {
  throw new Error(
    "OTP_SECRET must contain at least 32 characters.",
  );
}

// --------------------------------------------------
// Refresh-token configuration
// --------------------------------------------------

const refreshTokenDays = Number(
  process.env.REFRESH_TOKEN_DAYS || 7,
);

if (
  !Number.isInteger(refreshTokenDays) ||
  refreshTokenDays < 1 ||
  refreshTokenDays > 30
) {
  throw new Error(
    "REFRESH_TOKEN_DAYS must be between 1 and 30.",
  );
}

// --------------------------------------------------
// Frontend configuration
// --------------------------------------------------

const frontendOrigin =
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:3000";

// --------------------------------------------------
// SMTP configuration
// --------------------------------------------------

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);

const smtpSecureValue =
  process.env.SMTP_SECURE || "false";

if (!smtpHost) {
  throw new Error("SMTP_HOST is not configured.");
}

if (
  !Number.isInteger(smtpPort) ||
  smtpPort < 1 ||
  smtpPort > 65535
) {
  throw new Error("SMTP_PORT is invalid.");
}

if (!["true", "false"].includes(smtpSecureValue)) {
  throw new Error(
    "SMTP_SECURE must be true or false.",
  );
}

const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD;

if (!smtpUser || !smtpUser.includes("@")) {
  throw new Error("SMTP_USER is invalid.");
}

if (!smtpPassword || !smtpPassword.trim()) {
  throw new Error(
    "SMTP_PASSWORD is not configured.",
  );
}

// --------------------------------------------------
// Email sender configuration
// --------------------------------------------------

const mailFromName =
  process.env.MAIL_FROM_NAME || "VeriCore AI";

const mailFromEmail =
  process.env.MAIL_FROM_EMAIL || smtpUser;

if (!mailFromEmail.includes("@")) {
  throw new Error("MAIL_FROM_EMAIL is invalid.");
}

// --------------------------------------------------
// Export validated environment configuration
// --------------------------------------------------

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",

  PORT: Number(process.env.PORT) || 4000,

  MONGODB_URI: mongoUri,

  JWT_SECRET: jwtSecret,

  OTP_SECRET: otpSecret,

  ACCESS_TOKEN_TTL:
    process.env.ACCESS_TOKEN_TTL || "10m",

  REFRESH_TOKEN_DAYS: refreshTokenDays,

  FRONTEND_ORIGIN: frontendOrigin,

  SMTP_HOST: smtpHost,
  SMTP_PORT: smtpPort,
  SMTP_SECURE: smtpSecureValue === "true",
  SMTP_USER: smtpUser,
  SMTP_PASSWORD: smtpPassword.trim().replace(/\s+/g, ""),

  MAIL_FROM_NAME: mailFromName,
  MAIL_FROM_EMAIL: mailFromEmail,
} as const;
