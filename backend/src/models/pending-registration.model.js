
import mongoose from "mongoose";

const pendingRegistrationSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    age: {
      type: Number,
      required: true,
      min: 13,
      max: 120,
    },

    guardianEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },

    guardianPhone: {
      type: String,
      trim: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    otpExpiresAt: {
      type: Date,
      required: true,
    },

    otpAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

pendingRegistrationSchema.index(
  { email: 1 },
  { unique: true },
);

pendingRegistrationSchema.index(
  { otpExpiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export const PendingRegistration = mongoose.model(
  "PendingRegistration",
  pendingRegistrationSchema,
);
