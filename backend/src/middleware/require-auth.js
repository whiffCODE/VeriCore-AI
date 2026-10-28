
import { User } from "../models/user.model.js";

import {
  ACCESS_COOKIE,
  findActiveSession,
  verifyAccessToken,
} from "../services/session.service.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Please log in to continue.",
        },
      });
    }

    let claims;

    try {
      claims = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_OR_EXPIRED_ACCESS_TOKEN",
          message: "Your session has expired. Please refresh or log in again.",
        },
      });
    }

    if (!claims.sub || !claims.sid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_ACCESS_TOKEN",
          message: "Please log in again.",
        },
      });
    }

    const [user, session] = await Promise.all([
      User.findById(claims.sub),
      findActiveSession(claims.sid, claims.sub),
    ]);

    if (!user || user.status !== "active" || !session) {
      return res.status(401).json({
        success: false,
        error: {
          code: "SESSION_REVOKED",
          message: "Your session is no longer active.",
        },
      });
    }

    req.auth = {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
      role: user.role,
    };

    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
}
