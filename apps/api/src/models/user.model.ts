
import mongoose, {
  type InferSchemaType,
} from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // Platform-wide access level.
    // Public registration always receives "user".
    platformRole: {
      type: String,
      enum: ["user", "super_admin"],
      default: "user",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
      required: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type User = InferSchemaType<
  typeof userSchema
>;

export const UserModel =
  mongoose.models.User ||
  mongoose.model("User", userSchema);
