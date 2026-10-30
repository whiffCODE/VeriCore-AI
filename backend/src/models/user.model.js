
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
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

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    emailVerifiedAt: {
      type: Date,
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "pending_deletion"],
      default: "active",
      required: true,
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

    subscription: {
      plan: {
        type: String,
        enum: ["free", "pro", "enterprise"],
        default: "free",
      },

      status: {
        type: String,
        enum: ["trial", "active", "expired", "cancelled"],
        default: "trial",
      },

      startsAt: {
        type: Date,
        default: null,
      },

      endsAt: {
        type: Date,
        default: null,
      },
    },

    // Used to serialize concurrent subscription lifecycle updates.
    __billingRevision: {
      type: Number,
      default: 0,
      select: false,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const User = mongoose.models.User ?? mongoose.model("User", userSchema);

export { User };
export default User;
