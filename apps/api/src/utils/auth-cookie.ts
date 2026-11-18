
import type { Response } from "express";
import { env } from "../config/env.js";

export const REFRESH_COOKIE_NAME = "vericore_refresh";

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
};

export function setRefreshCookie(
  res: Response,
  token: string,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(
  res: Response,
): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
}
