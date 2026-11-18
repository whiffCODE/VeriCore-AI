
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true,
    },

    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "invited", "suspended"],
      default: "active",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

membershipSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true },
);

membershipSchema.index({ userId: 1, status: 1 });

membershipSchema.index({ workspaceId: 1, role: 1, status: 1 });

export type MembershipDocument =
  InferSchemaType<typeof membershipSchema>;

export const Membership =
  mongoose.models.Membership ||
  mongoose.model("Membership", membershipSchema);
