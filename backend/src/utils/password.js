import { env } from "../config/env.js";

export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < env.MIN_PASSWORD_LENGTH
  ) {
    throw new Error(
      `Password must contain at least ${env.MIN_PASSWORD_LENGTH} characters`
    );
  }

  if (password.length > 128) {
    throw new Error(
      "Password must not exceed 128 characters"
    );
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error(
      "Password must contain at least one uppercase letter"
    );
  }

  if (!/[a-z]/.test(password)) {
    throw new Error(
      "Password must contain at least one lowercase letter"
    );
  }

  if (!/[0-9]/.test(password)) {
    throw new Error(
      "Password must contain at least one number"
    );
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error(
      "Password must contain at least one special character"
    );
  }
}