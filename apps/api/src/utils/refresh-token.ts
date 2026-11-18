
import { createHash, randomBytes, randomUUID } from "node:crypto";

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function generateTokenFamilyId(): string {
  return randomUUID();
}
