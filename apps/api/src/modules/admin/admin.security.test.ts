
import { randomBytes } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../app.js";

import { UserModel } from "../../models/user.model.js";
import { OrganisationModel } from "../../models/organisation.model.js";
import { MembershipModel } from "../../models/membership.model.js";
import { RefreshTokenModel } from "../../models/refresh-token.model.js";

import { createAccessToken } from "../../utils/auth-token.js";
import {
  generateTokenFamilyId,
  hashRefreshToken,
} from "../../utils/refresh-token.js";

const mongoServer = await MongoMemoryReplSet.create({
  replSet: {
    count: 1,
    storageEngine: "wiredTiger",
  },
});

const mongoUri = mongoServer.getUri();

async function createTestUser(options?: {
  platformRole?: "user" | "super_admin";
  status?: "pending" | "active" | "suspended";
  email?: string;
}) {
  return UserModel.create({
    name: "Security Test User",
    email: options?.email ?? `user-${randomBytes(6).toString("hex")}@example.com`,
    passwordHash: "test-password-hash",
    platformRole: options?.platformRole ?? "user",
    status: options?.status ?? "active",
    emailVerifiedAt: new Date(),
  });
}

async function createTestSession(
  userId: Types.ObjectId,
  options?: {
    revokedAt?: Date | null;
    expiresAt?: Date;
  },
) {
  const rawToken = randomBytes(32).toString("base64url");
  const familyId = generateTokenFamilyId();

  await RefreshTokenModel.create({
    userId,
    tokenHash: hashRefreshToken(rawToken),
    familyId,
    expiresAt:
      options?.expiresAt ??
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    revokedAt: options?.revokedAt ?? null,
  });

  const accessToken = await createAccessToken(
    userId.toString(),
    familyId,
  );

  return { accessToken, familyId };
}

async function createOrganisationForUser(userId: Types.ObjectId) {
  const [organisation] = await OrganisationModel.create([
    {
      name: "Security Test Organisation",
      slug: `security-test-${randomBytes(6).toString("hex")}`,
      createdBy: userId,
      status: "active",
    },
  ]);

  await MembershipModel.create({
    userId,
    organisationId: organisation._id,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  return organisation;
}

describe("Platform Admin Security", () => {
  beforeAll(async () => {
    await mongoose.connect(mongoUri);

    await Promise.all([
      UserModel.init(),
      OrganisationModel.init(),
      MembershipModel.init(),
      RefreshTokenModel.init(),
    ]);
  }, 120_000);

  afterEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}),
      OrganisationModel.deleteMany({}),
      MembershipModel.deleteMany({}),
      RefreshTokenModel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe("Authentication enforcement", () => {
    it("rejects requests without an access token", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard");

      expect(response.status).toBe(401);
    });

    it("rejects malformed Bearer authorization headers", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", "Bearer ");

      expect(response.status).toBe(401);
    });

    it("rejects invalid access tokens", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", "Bearer invalid.jwt.token");

      expect(response.status).toBe(401);
    });

    it("rejects a validly signed token for a nonexistent user", async () => {
      const nonexistentUserId = new Types.ObjectId();
      const sessionId = generateTokenFamilyId();

      const accessToken = await createAccessToken(
        nonexistentUserId.toString(),
        sessionId,
      );

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe("Session enforcement", () => {
    it("rejects a revoked session", async () => {
      const user = await createTestUser({
        platformRole: "super_admin",
      });

      const { accessToken } = await createTestSession(user._id, {
        revokedAt: new Date(),
      });

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });

    it("rejects an expired session", async () => {
      const user = await createTestUser({
        platformRole: "super_admin",
      });

      const { accessToken } = await createTestSession(user._id, {
        expiresAt: new Date(Date.now() - 60_000),
      });

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe("Platform role authorization", () => {
    it("rejects an authenticated normal user with 403", async () => {
      const user = await createTestUser({
        platformRole: "user",
      });

      const { accessToken } = await createTestSession(user._id);

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("rejects a suspended Super Admin", async () => {
      const user = await createTestUser({
        platformRole: "super_admin",
        status: "suspended",
      });

      const { accessToken } = await createTestSession(user._id);

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe("Super Admin dashboard", () => {
    it("allows an active Super Admin and returns platform statistics", async () => {
      const admin = await createTestUser({
        platformRole: "super_admin",
        status: "active",
        email: "admin-test@example.com",
      });

      const normalUser = await createTestUser({
        platformRole: "user",
        status: "active",
      });

      await createTestUser({
        platformRole: "user",
        status: "suspended",
      });

      await createOrganisationForUser(admin._id);

      const { accessToken } = await createTestSession(admin._id);

      await createTestSession(normalUser._id);

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data.administrator).toMatchObject({
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        platformRole: "super_admin",
      });

      expect(response.body.data.statistics).toMatchObject({
        totalUsers: 3,
        activeUsers: 2,
        suspendedUsers: 1,
        totalSuperAdmins: 1,
        totalOrganisations: 1,
        activeMemberships: 1,
        activeSessions: 2,
      });
    });

    it("does not grant admin access based on a client-supplied role", async () => {
      const user = await createTestUser({
        platformRole: "user",
      });

      const { accessToken } = await createTestSession(user._id);

      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          platformRole: "super_admin",
        });

      expect(response.status).toBe(403);
    });
  });
});
