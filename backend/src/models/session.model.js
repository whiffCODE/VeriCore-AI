
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
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

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },

    userAgent: {
      type: String,
      maxlength: 500,
    },

    ipAddress: {
      type: String,
      maxlength: 100,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

sessionSchema.index({ user: 1, revokedAt: 1 });

export const Session = mongoose.model("Session", sessionSchema);
