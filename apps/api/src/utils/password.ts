
import argon2 from "argon2";

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const ARGON2_OPTIONS = {
  type: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function validatePasswordLength(
  password: string,
): boolean {
  const length = [...password].length;

  return (
    length >= PASSWORD_MIN_LENGTH &&
    length <= PASSWORD_MAX_LENGTH
  );
}

export async function hashPassword(
  password: string,
): Promise<string> {
  if (!validatePasswordLength(password)) {
    throw new Error(
      "Password must contain between 12 and 128 characters.",
    );
  }

  const hash = await argon2.hash(
    password,
    ARGON2_OPTIONS,
  );

  return hash.toString();
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
