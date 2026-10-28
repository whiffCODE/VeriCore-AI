
import mongoose from "mongoose";

const otpChallengeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    purpose: {
      type: String,
      required: true,
      enum: [
        "password_reset",
        "account_deletion",
        "email_recovery",
      ],
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    consumedAt: {
      type: Date,
      default: null,
    },

    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

otpChallengeSchema.index({ email: 1, purpose: 1 });
otpChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export const OtpChallenge = mongoose.model(
  "OtpChallenge",
  otpChallengeSchema,
);
