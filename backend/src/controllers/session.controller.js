
import bcrypt from "bcryptjs";

import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  createSession,
  hashRefreshToken,
  revokeSession,
  rotateSession,
  verifyAccessToken,
} from "../services/session.service.js";

function authError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function publicUser(user) {
  return {
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    role: user.role,
    status: user.status,
    subscription: user.subscription,
  };
}

export async function login(req, res, next) {
  try {
    const { identifier, password } = req.validatedBody;
    const normalized = identifier.trim();

    const isEmail = normalized.includes("@");

    const user = await User.findOne(
      isEmail
        ? { email: normalized.toLowerCase() }
        : { userId: normalized.toUpperCase() },
    ).select("+passwordHash");

    // Use the same response for an unknown user and an incorrect password.
    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return authError(
        res,
        401,
        "INVALID_CREDENTIALS",
        "The login details are incorrect.",
      );
    }

    if (!user.emailVerifiedAt) {
      return authError(
        res,
        403,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before logging in.",
      );
    }

    if (user.status !== "active") {
      return authError(
        res,
        403,
        "ACCOUNT_NOT_ACTIVE",
        "This account is not currently active. Contact support if you need assistance.",
      );
    }

    const session = await createSession(req, res, user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: publicUser(user),
      session: {
        id: session._id.toString(),
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    if (!refreshToken) {
      clearSessionCookies(res);

      return authError(
        res,
        401,
        "REFRESH_TOKEN_REQUIRED",
        "Your session has expired. Please log in again.",
      );
    }

    const session = await Session.findOne({
      tokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      clearSessionCookies(res);

      return authError(
        res,
        401,
        "INVALID_REFRESH_SESSION",
        "Your session is no longer valid. Please log in again.",
      );
    }

    const user = await User.findById(session.user);

    if (!user || user.status !== "active") {
      await revokeSession(session._id, session.user);
      clearSessionCookies(res);

      return authError(
        res,
        401,
        "ACCOUNT_NOT_ACTIVE",
        "Your account is not currently active.",
      );
    }

    const rotated = await rotateSession(req, res, session, user);

    if (!rotated) {
      clearSessionCookies(res);

      return authError(
        res,
        401,
        "REFRESH_TOKEN_REUSED",
        "The session could not be refreshed. Please log in again.",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Session refreshed.",
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    if (refreshToken) {
      const session = await Session.findOne({
        tokenHash: hashRefreshToken(refreshToken),
        revokedAt: null,
      });

      if (session) {
        await revokeSession(session._id, session.user);
      }
    }

    // Also revoke the session identified by a still-valid access JWT.
    const accessToken = req.cookies?.[ACCESS_COOKIE];

    if (accessToken) {
      try {
        const claims = verifyAccessToken(accessToken);

        if (claims.sub && claims.sid) {
          await revokeSession(claims.sid, claims.sub);
        }
      } catch {
        // An expired or invalid access token does not prevent logout.
      }
    }

    clearSessionCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(req, res, next) {
  try {
    const { revokeAllSessions } = await import(
      "../services/session.service.js"
    );

    await revokeAllSessions(req.user._id);

    clearSessionCookies(res);

    return res.status(200).json({
      success: true,
      message: "All sessions have been revoked.",
    });
  } catch (error) {
    next(error);
  }
}

export async function currentSession(req, res) {
  return res.status(200).json({
    success: true,
    user: publicUser(req.user),
    session: {
      id: req.auth.sessionId,
    },
  });
}
