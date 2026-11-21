
import type { RequestHandler } from "express";

import { UserModel } from "../models/user.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { AppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/auth-token.js";

// --------------------------------------------------
// Express request type extension
// --------------------------------------------------

export type PlatformRole = "user" | "super_admin";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        platformRole: PlatformRole;
      };
    }
  }
}

// --------------------------------------------------
// Authenticated user type
// --------------------------------------------------

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole;
}

// --------------------------------------------------
// Authentication middleware
// --------------------------------------------------

export const requireAuth: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    // 1. Extract the authorization header.

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(
        401,
        "Authentication required.",
      );
    }

    // 2. Extract the access token.

    const token = authorization.slice(7).trim();

    if (!token || token.includes(" ")) {
      throw new AppError(
        401,
        "Invalid authorization header.",
      );
    }

    // 3. Verify JWT signature and claims.

    let payload;

    try {
      payload = await verifyAccessToken(token);
    } catch {
      throw new AppError(
        401,
        "Invalid or expired access token.",
      );
    }

    // 4. Validate user ID.

    if (
      typeof payload.sub !== "string" ||
      !/^[a-f\d]{24}$/i.test(payload.sub)
    ) {
      throw new AppError(
        401,
        "Invalid access token.",
      );
    }

    // 5. Validate session ID.

    if (
      typeof payload.sid !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.sid)
    ) {
      throw new AppError(
        401,
        "Invalid access token session.",
      );
    }

    const userId = payload.sub;
    const sessionId = payload.sid;

    // 6. Fetch current user status and platform role.
    // Never trust a role supplied by the client or JWT.

    const user = await UserModel.findById(userId)
      .select("_id status platformRole")
      .exec();

    if (!user || user.status !== "active") {
      throw new AppError(
        401,
        "User account is unavailable.",
      );
    }

    // 7. Verify that the associated session is active.

    const activeSession = await RefreshTokenModel.exists({
      userId: user._id,
      familyId: sessionId,
      revokedAt: null,
      expiresAt: {
        $gt: new Date(),
      },
    });

    if (!activeSession) {
      throw new AppError(
        401,
        "Session is expired or has been revoked. Please log in again.",
      );
    }

    // 8. Resolve the current platform role.
    // Missing or unexpected values never grant admin access.

    const platformRole: PlatformRole =
      user.platformRole === "super_admin"
        ? "super_admin"
        : "user";

    // 9. Attach authenticated identity to both contexts.
    // Admin middleware/controllers use req.auth.
    // Auth controllers use res.locals.auth.

    const authenticatedContext: AuthenticatedUser = {
      userId: user._id.toString(),
      sessionId,
      platformRole,
    };

    req.auth = authenticatedContext;
    res.locals.auth = authenticatedContext;

    // 10. Continue to the protected route.

    next();
  } catch (error) {
    next(error);
  }
};
