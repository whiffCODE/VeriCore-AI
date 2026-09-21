import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/tokens.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const token = header.substring(7);

    const payload = verifyAccessToken(token);

    const user = await User.findById(
      payload.sub
    ).select("-passwordHash");

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }
}