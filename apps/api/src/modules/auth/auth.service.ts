
import mongoose, { Types } from "mongoose";
import { randomBytes } from "node:crypto";

import { UserModel } from "../../models/user.model.js";
import { OrganisationModel } from "../../models/organisation.model.js";
import { MembershipModel } from "../../models/membership.model.js";

import { hashPassword, verifyPassword } from "../../utils/password.js";
import { createAccessToken } from "../../utils/auth-token.js";
import { AppError } from "../../utils/app-error.js";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation.js";

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

function isDuplicateKeyError(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

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
    tokenType: "Bearer",
    expiresIn: 600,
  };
}

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

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
    accessToken,
    tokenType: "Bearer",
    expiresIn: 600,
  };
}
