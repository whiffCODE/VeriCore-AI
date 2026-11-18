
import mongoose, { Types } from "mongoose";
import { randomBytes } from "node:crypto";

import { UserModel } from "../../models/user.model.js";
import { OrganisationModel } from "../../models/organisation.model.js";
import { MembershipModel } from "../../models/membership.model.js";
import { RefreshTokenModel } from "../../models/refresh-token.model.js";

import {
  hashPassword,
  verifyPassword,
} from "../../utils/password.js";

import { createAccessToken } from "../../utils/auth-token.js";
import { AppError } from "../../utils/app-error.js";

import {
  generateRefreshToken,
  generateTokenFamilyId,
  hashRefreshToken,
} from "../../utils/refresh-token.js";

import { env } from "../../config/env.js";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation.js";

// --------------------------------------------------
// Organisation utilities
// --------------------------------------------------

function createOrganisationSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 65);

  const suffix = randomBytes(4).toString("hex");

  return `${base || "organisation"}-${suffix}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// --------------------------------------------------
// Refresh-token utilities
// --------------------------------------------------

async function createRefreshSession(
  userId: Types.ObjectId,
) {
  const rawToken = generateRefreshToken();

  const expiresAt = new Date(
    Date.now() +
      env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  );

  await RefreshTokenModel.create({
    userId,
    tokenHash: hashRefreshToken(rawToken),
    familyId: generateTokenFamilyId(),
    expiresAt,
  });

  return rawToken;
}

// --------------------------------------------------
// Registration
// --------------------------------------------------

export async function registerUser(
  input: RegisterInput,
) {
  const passwordHash = await hashPassword(
    input.password,
  );

  const session = await mongoose.startSession();

  let createdUserId: Types.ObjectId | undefined;
  let createdOrganisationId: Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const [user] = await UserModel.create(
        [
          {
            name: input.name,
            email: input.email,
            passwordHash,
            status: "active",
          },
        ],
        { session },
      );

      const [organisation] = await OrganisationModel.create(
        [
          {
            name: input.organisationName,
            slug: createOrganisationSlug(
              input.organisationName,
            ),
            createdBy: user._id,
            status: "active",
          },
        ],
        { session },
      );

      await MembershipModel.create(
        [
          {
            userId: user._id,
            organisationId: organisation._id,
            role: "owner",
            status: "active",
            joinedAt: new Date(),
          },
        ],
        { session },
      );

      createdUserId = user._id;
      createdOrganisationId = organisation._id;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        "An account with this email already exists.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }

  if (!createdUserId || !createdOrganisationId) {
    throw new AppError(
      500,
      "Registration could not be completed.",
    );
  }

  const accessToken = await createAccessToken(
    createdUserId.toString(),
  );

  const refreshToken = await createRefreshSession(
    createdUserId,
  );

  return {
    user: {
      id: createdUserId.toString(),
      name: input.name,
      email: input.email,
    },
    organisation: {
      id: createdOrganisationId.toString(),
      name: input.organisationName,
    },
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 600,
  };
}

// --------------------------------------------------
// Login
// --------------------------------------------------

export async function loginUser(
  input: LoginInput,
) {
  const user = await UserModel.findOne({
    email: input.email,
  }).select("+passwordHash");

  if (!user) {
    throw new AppError(
      401,
      "Invalid email or password.",
    );
  }

  const passwordIsValid = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordIsValid) {
    throw new AppError(
      401,
      "Invalid email or password.",
    );
  }

  if (user.status !== "active") {
    throw new AppError(
      403,
      "This account is not currently active.",
    );
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = await createAccessToken(
    user._id.toString(),
  );

  const refreshToken = await createRefreshSession(
    user._id,
  );

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 600,
  };
}

// --------------------------------------------------
// Current authenticated user
// --------------------------------------------------

export async function getCurrentUser(
  userId: string,
) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      401,
      "Invalid user identity.",
    );
  }

  const user = await UserModel.findById(userId).select(
    "name email status emailVerifiedAt createdAt",
  );

  if (!user || user.status !== "active") {
    throw new AppError(
      401,
      "User account is unavailable.",
    );
  }

  const memberships = await MembershipModel.find({
    userId: user._id,
    status: "active",
  })
    .populate({
      path: "organisationId",
      select: "name slug status",
    })
    .lean();

  const organisations = memberships
    .filter(
      (membership) =>
        membership.organisationId &&
        typeof membership.organisationId === "object" &&
        "name" in membership.organisationId,
    )
    .map((membership) => {
      const organisation = membership.organisationId as {
        _id: Types.ObjectId;
        name: string;
        slug: string;
        status: string;
      };

      return {
        id: organisation._id.toString(),
        name: organisation.name,
        slug: organisation.slug,
        status: organisation.status,
        role: membership.role,
      };
    })
    .filter(
      (organisation) => organisation.status === "active",
    );

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    organisations,
  };
}

// --------------------------------------------------
// Refresh-token rotation
// --------------------------------------------------


type RefreshTransactionResult =
  | { outcome: "success"; userId: Types.ObjectId }
  | { outcome: "reused" }
  | { outcome: "invalid" }
  | { outcome: "unavailable" };

export async function refreshUserSession(
  rawToken: string,
) {
  const tokenHash = hashRefreshToken(rawToken);
  const now = new Date();

  const session = await mongoose.startSession();

  const newRawToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRawToken);

  let result: RefreshTransactionResult;

  try {
    const transactionResult =
      await session.withTransaction<RefreshTransactionResult>(
        async () => {
          const existingToken =
            await RefreshTokenModel.findOneAndUpdate(
              {
                tokenHash,
                revokedAt: null,
                expiresAt: { $gt: now },
              },
              {
                $set: {
                  revokedAt: now,
                  lastUsedAt: now,
                },
              },
              {
                new: false,
                session,
              },
            );

          if (!existingToken) {
            const previousToken =
              await RefreshTokenModel.findOne({
                tokenHash,
              }).session(session);

            if (previousToken?.revokedAt) {
              await RefreshTokenModel.updateMany(
                {
                  familyId: previousToken.familyId,
                  revokedAt: null,
                },
                {
                  $set: { revokedAt: now },
                },
                { session },
              );

              return { outcome: "reused" };
            }

            return { outcome: "invalid" };
          }

          const user = await UserModel.findById(
            existingToken.userId,
          ).session(session);

          if (!user || user.status !== "active") {
            await RefreshTokenModel.updateMany(
              {
                familyId: existingToken.familyId,
                revokedAt: null,
              },
              {
                $set: { revokedAt: now },
              },
              { session },
            );

            return { outcome: "unavailable" };
          }

          const activeMembership =
            await MembershipModel.exists({
              userId: user._id,
              status: "active",
            }).session(session);

          if (!activeMembership) {
            await RefreshTokenModel.updateMany(
              {
                familyId: existingToken.familyId,
                revokedAt: null,
              },
              {
                $set: { revokedAt: now },
              },
              { session },
            );

            return { outcome: "unavailable" };
          }

          const expiresAt = new Date(
            Date.now() +
              env.REFRESH_TOKEN_DAYS *
                24 *
                60 *
                60 *
                1000,
          );

          await RefreshTokenModel.create(
            [
              {
                userId: user._id,
                tokenHash: newTokenHash,
                familyId: existingToken.familyId,
                expiresAt,
              },
            ],
            { session },
          );

          await RefreshTokenModel.updateOne(
            { _id: existingToken._id },
            {
              $set: {
                replacedByTokenHash: newTokenHash,
              },
            },
            { session },
          );

          return {
            outcome: "success",
            userId: user._id,
          };
        },
      );

    if (!transactionResult) {
      throw new AppError(
        500,
        "Refresh-token transaction returned no result.",
      );
    }

    result = transactionResult;
  } finally {
    await session.endSession();
  }

  if (result.outcome === "reused") {
    throw new AppError(
      401,
      "Refresh token reuse detected. Please log in again.",
    );
  }

  if (result.outcome === "unavailable") {
    throw new AppError(
      401,
      "User session is unavailable.",
    );
  }

  if (result.outcome !== "success") {
    throw new AppError(
      401,
      "Refresh token is invalid, expired or revoked.",
    );
  }

  const accessToken = await createAccessToken(
    result.userId.toString(),
  );

  return {
    accessToken,
    refreshToken: newRawToken,
    tokenType: "Bearer" as const,
    expiresIn: 600,
  };
}

// --------------------------------------------------
// Logout and session revocation
// --------------------------------------------------

export async function revokeRefreshSession(
  rawToken: string,
) {
  const tokenHash = hashRefreshToken(rawToken);

  await RefreshTokenModel.updateOne(
    {
      tokenHash,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );
}
