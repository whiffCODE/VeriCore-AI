
import type { RequestHandler } from "express";

import { AppError } from "../../utils/app-error.js";

import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshUserSession,
  revokeRefreshSession,
} from "./auth.service.js";

import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
} from "../../utils/auth-cookie.js";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation.js";

// REGISTER
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

// LOGIN
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

// CURRENT USER
export const currentUserController: RequestHandler =
  async (_req, res, next) => {
    try {
      const auth = res.locals.auth as {
        userId: string;
      } | undefined;

      if (!auth?.userId) {
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

// REFRESH SESSION
export const refreshController: RequestHandler =
  async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (typeof rawToken !== "string" || !rawToken) {
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

// LOGOUT
export const logoutController: RequestHandler =
  async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (typeof rawToken === "string" && rawToken) {
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
