import crypto from "node:crypto";

export function generateUserId() {
  const random = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  return `VC-${random}`;
}