
import type { RequestHandler } from "express";

import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/auth-token.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
      };
    }
  }
}

export const requireAuth: RequestHandler = async (
  req,
  _res,
  next,
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication required.");
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new AppError(401, "Authentication required.");
    }

    let payload;

    try {
      payload = await verifyAccessToken(token);
    } catch {
      throw new AppError(
        401,
        "Invalid or expired access token.",
      );
    }

    if (
      typeof payload.sub !== "string" ||
      !/^[a-f\d]{24}$/i.test(payload.sub)
    ) {
      throw new AppError(401, "Invalid access token.");
    }

    const user = await UserModel.findById(payload.sub)
      .select("_id status")
      .exec();

    if (!user || user.status !== "active") {
      throw new AppError(
        401,
        "User account is unavailable.",
      );
    }

    req.auth = {
      userId: user._id.toString(),
    };

    next();
  } catch (error) {
    next(error);
  }
};
