
import type { RequestHandler } from "express";

import { AppError } from "../../utils/app-error.js";

import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshUserSession,
  revokeRefreshSession,
  listUserSessions,
  revokeUserSession,
  revokeAllUserSessions,
} from "./auth.service.js";

import {
  requestOtp,
  verifyOtp,
} from "./otp.service.js";

import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
} from "../../utils/auth-cookie.js";

import type {
  RegisterInput,
  LoginInput,
  OtpRequestInput,
  OtpVerifyInput,
} from "./auth.validation.js";

// --------------------------------------------------
// Authenticated context
// --------------------------------------------------

interface AuthenticatedContext {
  userId: string;
  sessionId: string;
}

function getAuthenticatedContext(
  res: Parameters<RequestHandler>[1],
): AuthenticatedContext {
  const auth = res.locals.auth as
    | Partial<AuthenticatedContext>
    | undefined;

  if (
    !auth ||
    typeof auth.userId !== "string" ||
    !auth.userId ||
    typeof auth.sessionId !== "string" ||
    !auth.sessionId
  ) {
    throw new AppError(
      401,
      "Authentication required.",
    );
  }

  return {
    userId: auth.userId,
    sessionId: auth.sessionId,
  };
}

// --------------------------------------------------
// REQUEST REGISTRATION OTP
// POST /api/auth/otp/request
// --------------------------------------------------

export const requestOtpController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: OtpRequestInput;
      };

      await requestOtp(
        body.email,
        body.purpose,
      );

      // Keep the response independent of whether
      // the address is already registered.
      res.status(202).json({
        success: true,
        message:
          "If this address is eligible, a verification code will be sent.",
        data: {
          expiresIn: 600,
          resendAvailableIn: 60,
        },
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// VERIFY REGISTRATION OTP
// POST /api/auth/otp/verify
// --------------------------------------------------

export const verifyOtpController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: OtpVerifyInput;
      };

      const result = await verifyOtp(
        body.email,
        body.purpose,
        body.code,
      );

      res.status(200).json({
        success: true,
        message: "Email verified successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };


// --------------------------------------------------
// REGISTER VERIFIED USER
// POST /api/auth/register
// --------------------------------------------------

export const registerController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: RegisterInput;
      };

      const result = await registerUser(body);

      setRefreshCookie(res, result.refreshToken);

      const {
        refreshToken: _refreshToken,
        ...safeResult
      } = result;

      res.status(201).json({
        success: true,
        message: "Account registered successfully.",
        data: safeResult,
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

export const loginController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: LoginInput;
      };

      const result = await loginUser(body);

      setRefreshCookie(res, result.refreshToken);

      const {
        refreshToken: _refreshToken,
        ...safeResult
      } = result;

      res.status(200).json({
        success: true,
        message: "Login successful.",
        data: safeResult,
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

export const currentUserController: RequestHandler =
  async (_req, res, next) => {
    try {
      const auth = res.locals.auth as
        | { userId?: string }
        | undefined;

      if (
        !auth ||
        typeof auth.userId !== "string" ||
        !auth.userId
      ) {
        throw new AppError(
          401,
          "Authentication required.",
        );
      }

      const result = await getCurrentUser(auth.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// REFRESH SESSION
// --------------------------------------------------

export const refreshController: RequestHandler =
  async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (
        typeof rawToken !== "string" ||
        !rawToken
      ) {
        throw new AppError(
          401,
          "Refresh token required.",
        );
      }

      const result = await refreshUserSession(rawToken);

      setRefreshCookie(res, result.refreshToken);

      const {
        refreshToken: _refreshToken,
        ...safeResult
      } = result;

      res.status(200).json({
        success: true,
        message: "Session refreshed successfully.",
        data: safeResult,
      });
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  };

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

export const logoutController: RequestHandler =
  async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (
        typeof rawToken === "string" &&
        rawToken
      ) {
        await revokeRefreshSession(rawToken);
      }

      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: "Logged out successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// LIST ALL ACTIVE SESSIONS
// --------------------------------------------------

export const listSessionsController: RequestHandler =
  async (_req, res, next) => {
    try {
      const auth = getAuthenticatedContext(res);

      const sessions = await listUserSessions(
        auth.userId,
        auth.sessionId,
      );

      res.status(200).json({
        success: true,
        data: { sessions },
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// REVOKE ONE SESSION
// --------------------------------------------------

export const revokeSessionController: RequestHandler =
  async (req, res, next) => {
    try {
      const auth = getAuthenticatedContext(res);
      const { sessionId } = req.params;

      if (
        typeof sessionId !== "string" ||
        !sessionId.trim()
      ) {
        throw new AppError(
          400,
          "A valid session ID is required.",
        );
      }

      const revoked = await revokeUserSession(
        auth.userId,
        sessionId,
      );

      if (!revoked) {
        throw new AppError(
          404,
          "Session not found or already revoked.",
        );
      }

      res.status(200).json({
        success: true,
        message: "Session revoked successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

// --------------------------------------------------
// REVOKE ALL SESSIONS
// --------------------------------------------------

export const revokeAllSessionsController: RequestHandler =
  async (_req, res, next) => {
    try {
      const auth = getAuthenticatedContext(res);

      const result = await revokeAllUserSessions(
        auth.userId,
      );

      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: "All sessions revoked successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
