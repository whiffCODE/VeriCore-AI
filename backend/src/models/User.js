import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ["FREE_TRIAL", "PRO", "ENTERPRISE"],
      default: "FREE_TRIAL"
    },

    billingCycle: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"],
      default: null
    },

    status: {
      type: String,
      enum: ["NONE", "ACTIVE", "EXPIRED", "CANCELLED"],
      default: "NONE"
    },

    startedAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50
    },

    email: {
      type: String,
      required: true,
      trim: true
    },

    emailNormalized: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    age: {
      type: Number,
      required: true,
      min: 13,
      max: 120
    },

    parentEmail: {
      type: String,
      default: null
    },

    parentPhone: {
      type: String,
      default: null
    },

    parentalAssuranceRequired: {
      type: Boolean,
      default: false
    },

    parentalAssuranceStatus: {
      type: String,
      enum: ["NOT_REQUIRED", "PENDING", "VERIFIED"],
      default: "NOT_REQUIRED"
    },

    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    passwordHash: {
      type: String,
      default: null
    },

    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER"
    },

    status: {
      type: String,
      enum: ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DELETED"],
      default: "PENDING_VERIFICATION"
    },

    emailVerifiedAt: {
      type: Date,
      default: null
    },

    subscription: {
      type: subscriptionSchema,
      default: () => ({})
    },

    trialUsed: {
      type: Boolean,
      default: false
    },

    lastLoginAt: {
      type: Date,
      default: null
    },

    passwordChangedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({
  firstName: 1,
  lastName: 1
});

export const User = mongoose.model("User", userSchema);