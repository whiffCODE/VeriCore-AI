import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { User } from "../../models/user.model.js";

const TEST_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  "test-access-secret-which-is-at-least-32-characters-long";

export async function createTestUser(overrides = {}) {
  const uniqueId = crypto.randomUUID().replaceAll("-", "");

  const userData = {
    firstName: "Test",
    lastName: "User",
    email: `test-${uniqueId}@example.com`,
    phone: `+9198${String(Date.now()).slice(-8)}`,
    age: 25,
    passwordHash: "test-password-hash",
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
    subscription: {
      plan: "free",
      status: "trial",
      startsAt: new Date(),
      endsAt: null,
    },
    ...overrides,
  };

  return User.create(userData);
}

export async function getAuthToken(user) {
  const userId = user._id.toString();

  return jwt.sign(
    {
      sub: userId,
      userId,
      email: user.email,
      role: user.role,
    },
    TEST_ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
}
