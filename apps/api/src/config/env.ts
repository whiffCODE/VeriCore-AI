
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;

if (!mongoUri) {
  throw new Error("MONGODB_URI is not configured.");
}

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must contain at least 32 characters.",
  );
}

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

const frontendOrigin =
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:3000";

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 4000,
  MONGODB_URI: mongoUri,
  JWT_SECRET: jwtSecret,
  ACCESS_TOKEN_TTL:
    process.env.ACCESS_TOKEN_TTL || "10m",
  REFRESH_TOKEN_DAYS: refreshTokenDays,
  FRONTEND_ORIGIN: frontendOrigin,
} as const;
