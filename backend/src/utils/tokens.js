import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      userId: user.userId,
      role: user.role,
      type: "access"
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN
    }
  );
}

export function createRefreshToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      userId: user.userId,
      type: "refresh"
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
    }
  );
}

export function createRegistrationSetupToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      purpose: "REGISTRATION_PASSWORD_SETUP"
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: "10m"
    }
  );
}

export function createPasswordResetToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      purpose: "PASSWORD_RESET"
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: "10m"
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}