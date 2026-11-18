
import {
  SignJWT,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { env } from "../config/env.js";

const secret = new TextEncoder().encode(
  env.JWT_SECRET,
);

export async function createAccessToken(
  userId: string,
): Promise<string> {
  return new SignJWT({
    tokenType: "access",
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(userId)
    .setIssuer("vericore-api")
    .setAudience("vericore-client")
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: "vericore-api",
    audience: "vericore-client",
  });

  if (
    payload.tokenType !== "access" ||
    typeof payload.sub !== "string"
  ) {
    throw new Error("Invalid access token.");
  }

  return payload;
}
