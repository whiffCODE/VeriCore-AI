
import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";

import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { UserModel } from "../../models/user.model.js";
import { OrganisationModel } from "../../models/organisation.model.js";
import { MembershipModel } from "../../models/membership.model.js";
import { RefreshTokenModel } from "../../models/refresh-token.model.js";
import { EmailVerificationGrantModel } from "../../models/email-verification-grant.model.js";

import { registerUser } from "./auth.service.js";
import { registerSchema } from "./auth.validation.js";

import type { RegisterInput } from "./auth.validation.js";

// --------------------------------------------------
// Test database
// --------------------------------------------------

let mongoReplicaSet: MongoMemoryReplSet;

const TEST_EMAIL = "registration-test@example.com";
const TEST_PASSWORD = "StrongTestPassword123!";

function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashVerificationToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function createRegistrationInput(
  verificationToken: string,
  overrides: Partial<RegisterInput> = {},
): RegisterInput {
  return {
    name: "Test User",
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    organisationName: "Test Organisation",
    verificationToken,
    ...overrides,
  };
}

async function createVerificationGrant(
  email: string,
  token: string,
  options?: {
    expiresAt?: Date;
    consumedAt?: Date | null;
  },
) {
  return EmailVerificationGrantModel.create({
    email: email.toLowerCase(),
    purpose: "registration",
    tokenHash: hashVerificationToken(token),
    expiresAt:
      options?.expiresAt ??
      new Date(Date.now() + 15 * 60 * 1000),
    consumedAt: options?.consumedAt ?? null,
  });
}

// --------------------------------------------------
// Lifecycle
// --------------------------------------------------

beforeAll(async () => {
  mongoReplicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
    },
  });

  await mongoose.connect(mongoReplicaSet.getUri());

  await Promise.all([
    UserModel.init(),
    OrganisationModel.init(),
    MembershipModel.init(),
    RefreshTokenModel.init(),
    EmailVerificationGrantModel.init(),
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoReplicaSet) {
    await mongoReplicaSet.stop();
  }
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    MembershipModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
    OrganisationModel.deleteMany({}),
    UserModel.deleteMany({}),
    EmailVerificationGrantModel.deleteMany({}),
  ]);
});

// --------------------------------------------------
// Registration security tests
// --------------------------------------------------

describe("Registration security tests", () => {
  describe("Registration input validation", () => {
    it("rejects registration without a verification token", () => {
      const result = registerSchema.safeParse({
        name: "Test User",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        organisationName: "Test Organisation",
      });

      expect(result.success).toBe(false);
    });

    it("rejects a verification token that is too short", () => {
      const result = registerSchema.safeParse({
        name: "Test User",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        organisationName: "Test Organisation",
        verificationToken: "short-token",
      });

      expect(result.success).toBe(false);
    });

    it("does not accept a client-supplied platform role", () => {
      const result = registerSchema.safeParse({
        name: "Test User",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        organisationName: "Test Organisation",
        verificationToken: generateVerificationToken(),
        platformRole: "super_admin",
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(
          "platformRole" in result.data,
        ).toBe(false);
      }
    });
  });

  describe("Verification grant enforcement", () => {
    it("rejects registration without a verification grant", async () => {
      const token = generateVerificationToken();

      await expect(
        registerUser(createRegistrationInput(token)),
      ).rejects.toThrow(
        "Email verification is required or the verification grant has expired.",
      );

      expect(await UserModel.countDocuments()).toBe(0);
      expect(await OrganisationModel.countDocuments()).toBe(0);
      expect(await MembershipModel.countDocuments()).toBe(0);
    });

    it("rejects an invalid verification token", async () => {
      const validToken = generateVerificationToken();
      const invalidToken = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        validToken,
      );

      await expect(
        registerUser(
          createRegistrationInput(invalidToken),
        ),
      ).rejects.toThrow(
        "Email verification is required or the verification grant has expired.",
      );

      expect(await UserModel.countDocuments()).toBe(0);
    });

    it("rejects an expired verification grant", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
        {
          expiresAt: new Date(Date.now() - 1000),
        },
      );

      await expect(
        registerUser(createRegistrationInput(token)),
      ).rejects.toThrow(
        "Email verification is required or the verification grant has expired.",
      );

      expect(await UserModel.countDocuments()).toBe(0);
    });

    it("rejects an already consumed verification grant", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
        {
          consumedAt: new Date(),
        },
      );

      await expect(
        registerUser(createRegistrationInput(token)),
      ).rejects.toThrow(
        "Email verification is required or the verification grant has expired.",
      );

      expect(await UserModel.countDocuments()).toBe(0);
    });

    it("does not allow a verification grant to be reused", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
      );

      const firstRegistration = await registerUser(
        createRegistrationInput(token),
      );

      expect(firstRegistration.user.email).toBe(TEST_EMAIL);

      await expect(
        registerUser(createRegistrationInput(token)),
      ).rejects.toThrow(
        "Email verification is required or the verification grant has expired.",
      );

      expect(await UserModel.countDocuments()).toBe(1);
      expect(await OrganisationModel.countDocuments()).toBe(1);
      expect(await MembershipModel.countDocuments()).toBe(1);
    });
  });

  describe("Successful registration", () => {
    it("creates a verified user, organisation and owner membership", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
      );

      const result = await registerUser(
        createRegistrationInput(token),
      );

      expect(result.user.email).toBe(TEST_EMAIL);
      expect(result.user.emailVerified).toBe(true);
      expect(result.user.platformRole).toBe("user");

      expect(result.organisation.name).toBe(
        "Test Organisation",
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();

      expect(await UserModel.countDocuments()).toBe(1);
      expect(await OrganisationModel.countDocuments()).toBe(1);
      expect(await MembershipModel.countDocuments()).toBe(1);
      expect(await RefreshTokenModel.countDocuments()).toBe(1);

      const user = await UserModel.findOne({
        email: TEST_EMAIL,
      });

      expect(user).not.toBeNull();
      expect(user?.status).toBe("active");
      expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(user?.platformRole).toBe("user");

      const organisation = await OrganisationModel.findOne({
        createdBy: user?._id,
      });

      expect(organisation).not.toBeNull();
      expect(organisation?.status).toBe("active");

      const membership = await MembershipModel.findOne({
        userId: user?._id,
        organisationId: organisation?._id,
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe("owner");
      expect(membership?.status).toBe("active");

      const grant = await EmailVerificationGrantModel.findOne({
        email: TEST_EMAIL,
      });

      expect(grant?.consumedAt).toBeInstanceOf(Date);
    });

    it("normalizes the registered email address", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
      );

      await registerUser(
        createRegistrationInput(token, {
          email: "  REGISTRATION-TEST@EXAMPLE.COM  ",
        }),
      );

      const user = await UserModel.findOne({
        email: TEST_EMAIL,
      });

      expect(user).not.toBeNull();
    });

    it("never grants super_admin through public registration", async () => {
      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
      );

      // Simulate a caller attempting to bypass the
      // public validation layer.
      const maliciousInput = {
        ...createRegistrationInput(token),
        platformRole: "super_admin",
      } as RegisterInput;

      const result = await registerUser(maliciousInput);

      expect(result.user.platformRole).toBe("user");

      const user = await UserModel.findOne({
        email: TEST_EMAIL,
      });

      expect(user?.platformRole).toBe("user");
    });
  });

  describe("Duplicate account protection", () => {
    it("rejects registration when the email already exists", async () => {
      await UserModel.create({
        name: "Existing User",
        email: TEST_EMAIL,
        passwordHash: "existing-test-password-hash",
        platformRole: "user",
        status: "active",
        emailVerifiedAt: new Date(),
      });

      const token = generateVerificationToken();

      await createVerificationGrant(
        TEST_EMAIL,
        token,
      );

      await expect(
        registerUser(createRegistrationInput(token)),
      ).rejects.toThrow(
        "An account with this email already exists.",
      );

      // No partial organisation or membership should remain.
      expect(await UserModel.countDocuments()).toBe(1);
      expect(await OrganisationModel.countDocuments()).toBe(0);
      expect(await MembershipModel.countDocuments()).toBe(0);
      expect(await RefreshTokenModel.countDocuments()).toBe(0);

      // The transaction should roll back grant consumption.
      const grant = await EmailVerificationGrantModel.findOne({
        email: TEST_EMAIL,
      });

      expect(grant?.consumedAt).toBeNull();
    });
  });
});
