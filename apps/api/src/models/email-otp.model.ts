
import mongoose from "mongoose";

const { Schema } = mongoose;

export const OTP_PURPOSES = [
  "registration",
  "password_reset",
  "email_change",
] as const;

export type OtpPurpose =
  (typeof OTP_PURPOSES)[number];

const emailOtpSchema = new Schema(
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
      enum: OTP_PURPOSES,
      required: true,
    },

    // HMAC-SHA256 hash. Never store the raw OTP.
    codeHash: {
      type: String,
      required: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    resendAvailableAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
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

// One active OTP record per email and purpose.
emailOtpSchema.index(
  { email: 1, purpose: 1 },
  { unique: true },
);

// MongoDB automatically removes expired records.
// Application logic must still check expiresAt.
emailOtpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export type EmailOtp = mongoose.InferSchemaType<
  typeof emailOtpSchema
>;

export const EmailOtpModel =
  mongoose.models.EmailOtp ||
  mongoose.model("EmailOtp", emailOtpSchema);
