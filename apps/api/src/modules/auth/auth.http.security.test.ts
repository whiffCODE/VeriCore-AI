
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../../utils/app-error.js";

// --------------------------------------------------
// Mock authentication service dependencies
// --------------------------------------------------

const mocks = vi.hoisted(() => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getCurrentUser: vi.fn(),
  refreshUserSession: vi.fn(),
  revokeRefreshSession: vi.fn(),
  listUserSessions: vi.fn(),
  revokeUserSession: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("./auth.service.js", () => ({
  registerUser: mocks.registerUser,
  loginUser: mocks.loginUser,
  getCurrentUser: mocks.getCurrentUser,
  refreshUserSession: mocks.refreshUserSession,
  revokeRefreshSession: mocks.revokeRefreshSession,
  listUserSessions: mocks.listUserSessions,
  revokeUserSession: mocks.revokeUserSession,
  revokeAllUserSessions: mocks.revokeAllUserSessions,
}));

vi.mock("./otp.service.js", () => ({
  requestOtp: mocks.requestOtp,
  verifyOtp: mocks.verifyOtp,
}));

import app from "../../app.js";

// --------------------------------------------------
// Test fixtures
// --------------------------------------------------

const refreshToken = "test-refresh-token-never-expose-this";
const accessToken = "test-access-token";

const registrationBody = {
  name: "Test User",
  email: "test@example.com",
  password: "TestPassword123!",
  organisationName: "Test Organisation",
  verificationToken: "a".repeat(43),
};

const registrationResult = {
  user: {
    id: "674a12345678901234567890",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    platformRole: "user",
  },
  organisation: {
    id: "674a12345678901234567891",
    name: "Test Organisation",
  },
  accessToken,
  refreshToken,
  tokenType: "Bearer",
  expiresIn: 600,
};

const loginResult = {
  user: registrationResult.user,
  accessToken,
  refreshToken,
  tokenType: "Bearer",
  expiresIn: 600,
};

function getSetCookieHeaders(response: {
  headers: Record<string, unknown>;
}): string[] {
  const cookies = response.headers["set-cookie"];

  if (!cookies) {
    return [];
  }

  return Array.isArray(cookies)
    ? cookies.map(String)
    : [String(cookies)];
}

function expectSecureRefreshCookie(response: {
  headers: Record<string, unknown>;
}) {
  const cookies = getSetCookieHeaders(response);

  expect(cookies.length).toBeGreaterThan(0);

  const refreshCookie = cookies.find((cookie) =>
    cookie.startsWith("vericore_refresh="),
  );

  expect(refreshCookie).toBeDefined();
  expect(refreshCookie).toContain("HttpOnly");
  expect(refreshCookie).toContain("Path=/api/auth");
  expect(refreshCookie).toContain("SameSite=Strict");
  expect(refreshCookie).not.toContain("Secure");
}

// --------------------------------------------------
// HTTP security tests
// --------------------------------------------------

describe("Authentication HTTP Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------
  // Registration
  // ------------------------------------------------

  describe("POST /api/auth/register", () => {
    it("registers successfully and does not expose the refresh token in JSON", async () => {
      mocks.registerUser.mockResolvedValue(registrationResult);

      const response = await request(app)
        .post("/api/auth/register")
        .send(registrationBody);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      expect(response.body.data).toMatchObject({
        user: registrationResult.user,
        organisation: registrationResult.organisation,
        accessToken,
        tokenType: "Bearer",
        expiresIn: 600,
      });

      expect(response.body.data).not.toHaveProperty("refreshToken");
      expect(JSON.stringify(response.body)).not.toContain(refreshToken);

      expectSecureRefreshCookie(response);

      expect(mocks.registerUser).toHaveBeenCalledTimes(1);
    });

    it("does not pass a client-supplied platformRole to the registration service", async () => {
      mocks.registerUser.mockResolvedValue(registrationResult);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          ...registrationBody,
          platformRole: "super_admin",
        });

      expect(response.status).toBe(201);

      const serviceInput = mocks.registerUser.mock.calls[0][0];

      expect(serviceInput).not.toHaveProperty("platformRole");
      expect(serviceInput).toMatchObject({
        email: "test@example.com",
        name: "Test User",
      });
    });

    it("rejects registration without a verification token", async () => {
      const {
        verificationToken: _verificationToken,
        ...invalidBody
      } = registrationBody;

      const response = await request(app)
        .post("/api/auth/register")
        .send(invalidBody);

      expect(response.status).toBe(400);
      expect(mocks.registerUser).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------
  // Login
  // ------------------------------------------------

  describe("POST /api/auth/login", () => {
    it("logs in and does not expose the refresh token in JSON", async () => {
      mocks.loginUser.mockResolvedValue(loginResult);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "TestPassword123!",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data).toHaveProperty("accessToken", accessToken);
      expect(response.body.data).not.toHaveProperty("refreshToken");

      expect(JSON.stringify(response.body)).not.toContain(refreshToken);

      expectSecureRefreshCookie(response);
      expect(mocks.loginUser).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid credentials", async () => {
      mocks.loginUser.mockRejectedValue(
        new AppError(401, "Invalid email or password."),
      );

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "wrong@example.com",
          password: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
      expect(mocks.loginUser).toHaveBeenCalledTimes(1);
    });

    it("rejects a missing password before calling the service", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
        });

      expect(response.status).toBe(400);
      expect(mocks.loginUser).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------
  // Refresh session
  // ------------------------------------------------

  describe("POST /api/auth/refresh", () => {
    it("rotates the refresh token and does not expose it in JSON", async () => {
      mocks.refreshUserSession.mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        tokenType: "Bearer",
        expiresIn: 600,
      });

      const response = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", "http://localhost:3000")
        .set("Cookie", "vericore_refresh=old-refresh-token");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data).toHaveProperty(
        "accessToken",
        "new-access-token",
      );

      expect(response.body.data).not.toHaveProperty("refreshToken");
      expect(JSON.stringify(response.body)).not.toContain("new-refresh-token");

      expectSecureRefreshCookie(response);

      expect(mocks.refreshUserSession).toHaveBeenCalledWith(
        "old-refresh-token",
      );
    });

    it("rejects refresh requests without a refresh cookie", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", "http://localhost:3000");

      expect(response.status).toBe(401);
      expect(mocks.refreshUserSession).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------
  // Logout
  // ------------------------------------------------

  describe("POST /api/auth/logout", () => {
    it("revokes the refresh session and clears the cookie", async () => {
      mocks.revokeRefreshSession.mockResolvedValue(undefined);

      const response = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://localhost:3000")
        .set("Cookie", "vericore_refresh=old-refresh-token");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(mocks.revokeRefreshSession).toHaveBeenCalledWith(
        "old-refresh-token",
      );

      const cookies = getSetCookieHeaders(response);

      const clearedCookie = cookies.find((cookie) =>
        cookie.startsWith("vericore_refresh="),
      );

      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain("HttpOnly");
      expect(clearedCookie).toContain("Path=/api/auth");
      expect(clearedCookie).toContain("SameSite=Strict");
      expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });

    it("allows logout without a refresh cookie", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://localhost:3000");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(mocks.revokeRefreshSession).not.toHaveBeenCalled();
    });
  });
});
