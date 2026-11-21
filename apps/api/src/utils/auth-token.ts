
import {
  SignJWT,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { env } from "../config/env.js";

const secret = new TextEncoder().encode(
  env.JWT_SECRET,
);

const ISSUER = "vericore-api";
const AUDIENCE = "vericore-client";


export async function createAccessToken(
  userId: string,
  sessionId: string,
): Promise<string> {
  return new SignJWT({
    tokenType: "access",
    sid: sessionId,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}


export async function verifyAccessToken(
  token: string,
): Promise<JWTPayload> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    secret,
    {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    },
  );

  if (
  protectedHeader.typ !== "JWT" ||
  payload.tokenType !== "access" ||
  typeof payload.sub !== "string" ||
  typeof payload.sid !== "string"
) {
  throw new Error("Invalid access token.");
}

  return payload;
}
