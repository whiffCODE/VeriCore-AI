
import {
  createHash,
  randomBytes,
} from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { Session } from "../models/session.model.js";

export const ACCESS_COOKIE = "vc_access";
export const REFRESH_COOKIE = "vc_refresh";

const ACCESS_TTL_SECONDS = 15 * 60;

const REFRESH_TTL_MS =
  env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export function hashRefreshToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function clearSessionCookies(res) {
  const options = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

function signAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sid: sessionId,
      role: user.role,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user._id.toString(),
      expiresIn: ACCESS_TTL_SECONDS,
      issuer: "vericore-ai",
      audience: "vericore-ai-web",
    },
  );
}

export async function createSession(req, res, user) {
  const refreshToken = randomBytes(32).toString("base64url");

  const session = await Session.create({
    user: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: req.get("user-agent")?.slice(0, 500),
    ipAddress: req.ip?.slice(0, 100),
    lastUsedAt: new Date(),
  });

  const accessToken = signAccessToken(
    user,
    session._id.toString(),
  );

  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(ACCESS_TTL_SECONDS * 1000),
  );

  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(REFRESH_TTL_MS),
  );

  return session;
}

export async function rotateSession(req, res, session, user) {
  const nextRefreshToken = randomBytes(32).toString("base64url");
  const now = new Date();

  const updated = await Session.findOneAndUpdate(
    {
      _id: session._id,
      tokenHash: hashRefreshToken(
        req.cookies?.[REFRESH_COOKIE] ?? "",
      ),
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        tokenHash: hashRefreshToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        lastUsedAt: now,
        userAgent: req.get("user-agent")?.slice(0, 500),
        ipAddress: req.ip?.slice(0, 100),
      },
    },
    { new: true },
  );

  // Atomic comparison prevents two simultaneous refresh requests
  // from successfully rotating the same token.
  if (!updated) {
    return false;
  }

  const accessToken = signAccessToken(
    user,
    updated._id.toString(),
  );

  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(ACCESS_TTL_SECONDS * 1000),
  );

  res.cookie(
    REFRESH_COOKIE,
    nextRefreshToken,
    cookieOptions(REFRESH_TTL_MS),
  );

  return true;
}

export async function revokeSession(sessionId, userId) {
  await Session.updateOne(
    {
      _id: sessionId,
      user: userId,
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    },
  );
}

export async function revokeAllSessions(userId) {
  await Session.updateMany(
    {
      user: userId,
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "vericore-ai",
    audience: "vericore-ai-web",
  });
}

export async function findActiveSession(sessionId, userId) {
  return Session.findOne({
    _id: sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}
