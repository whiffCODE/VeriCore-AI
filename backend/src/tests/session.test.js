
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

import { app } from "../app.js";
import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";

let mongo;

const password = "StrongPass123!";

let user;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    User.init(),
    Session.init(),
  ]);
}, 30000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
  ]);

  user = await User.create({
    userId: "VC-2026-ABCDEF1234",
    firstName: "Aarav",
    lastName: "Sen",
    email: "aarav@example.com",
    phone: "9876543210",
    age: 24,
    passwordHash: await bcrypt.hash(password, 12),
    emailVerifiedAt: new Date(),
    role: "user",
    status: "active",
  });
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongo) {
    await mongo.stop();
  }
});

describe("Authentication and session management", () => {
  it("logs in with a verified email and sets HTTP-only cookies", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: "aarav@example.com",
        password,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.userId).toBe(user.userId);

    const cookies = response.headers["set-cookie"];

    expect(cookies).toBeDefined();
    expect(cookies.some((cookie) => cookie.startsWith("vc_access="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("vc_refresh="))).toBe(true);

    expect(cookies.every((cookie) => /HttpOnly/i.test(cookie))).toBe(true);

    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");

    expect(await Session.countDocuments({ user: user._id })).toBe(1);
  });

  it("logs in with the generated user ID", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: user.userId.toLowerCase(),
        password,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("aarav@example.com");
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: "aarav@example.com",
        password: "IncorrectPassword123!",
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a suspended account", async () => {
    await User.updateOne(
      { _id: user._id },
      { $set: { status: "suspended" } },
    );

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: user.userId,
        password,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_NOT_ACTIVE");
  });

  it("rejects access to the current session without authentication", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("refreshes a session and rotates the refresh token", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        identifier: user.userId,
        password,
      });

    expect(loginResponse.status).toBe(200);

    const before = await Session.findOne({
      user: user._id,
    }).select("+tokenHash");

    const oldHash = before.tokenHash;

    const refreshResponse = await agent
      .post("/api/auth/refresh")
      .send({});

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.success).toBe(true);

    const after = await Session.findById(before._id).select("+tokenHash");

    expect(after.tokenHash).not.toBe(oldHash);

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.userId).toBe(user.userId);
  });

  it("revokes the session on logout", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        identifier: user.userId,
        password,
      });

    expect(loginResponse.status).toBe(200);

    const logoutResponse = await agent
      .post("/api/auth/logout")
      .send({});

    expect(logoutResponse.status).toBe(200);

    const session = await Session.findOne({ user: user._id });

    expect(session.revokedAt).toBeInstanceOf(Date);

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(401);
  });

  it("revokes all active sessions on logout-all", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        identifier: user.userId,
        password,
      });

    expect(loginResponse.status).toBe(200);

    const response = await agent
      .post("/api/auth/logout-all")
      .send({});

    expect(response.status).toBe(200);

    const activeSessions = await Session.countDocuments({
      user: user._id,
      revokedAt: null,
    });

    expect(activeSessions).toBe(0);
  });
});
