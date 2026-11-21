
import type { RequestHandler } from "express";

import { AppError } from "../utils/app-error.js";

// --------------------------------------------------
// Platform Super Admin Authorization
// --------------------------------------------------

export const requireSuperAdmin: RequestHandler = (
  req,
  _res,
  next,
) => {
  try {
    // 1. Ensure authentication has already run.

    if (!req.auth) {
      throw new AppError(
        401,
        "Authentication required.",
      );
    }

    // 2. Check the current platform role.

    if (req.auth.platformRole !== "super_admin") {
      throw new AppError(
        403,
        "Platform Super Admin access required.",
      );
    }

    // 3. Allow authorized administrator.

    next();
  } catch (error) {
    next(error);
  }
};
