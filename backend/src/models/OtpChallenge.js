import mongoose from "mongoose";

const otpChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    purpose: {
      type: String,
      enum: [
        "REGISTRATION",
        "FORGOT_PASSWORD",
        "RECOVER_USER_ID",
        "RECOVER_EMAIL"
      ],
      required: true
    },

    otpHash: {
      type: String,
      required: true
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    attempts: {
      type: Number,
      default: 0
    },

    consumedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

otpChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const OtpChallenge = mongoose.model(
  "OtpChallenge",
  otpChallengeSchema
);