import mongoose, {
  type InferSchemaType,
} from "mongoose";

const { Schema } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    familyId: {
      type: String,
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    replacedByTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Automatically remove expired token records.
refreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

// Efficiently find a user's active sessions.
refreshTokenSchema.index({
  userId: 1,
  revokedAt: 1,
  expiresAt: 1,
});

export type RefreshToken =
  InferSchemaType<typeof refreshTokenSchema>;

export const RefreshTokenModel = mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);
