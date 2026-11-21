
import mongoose from "mongoose";

const { Schema } = mongoose;

const emailVerificationGrantSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    purpose: {
      type: String,
      enum: ["registration"],
      required: true,
    },

    // Store only the hash of the random grant token.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

emailVerificationGrantSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export const EmailVerificationGrantModel =
  mongoose.models.EmailVerificationGrant ||
  mongoose.model(
    "EmailVerificationGrant",
    emailVerificationGrantSchema,
  );
