
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "archived"],
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

workspaceSchema.index({ createdBy: 1, createdAt: -1 });

export type WorkspaceDocument =
  InferSchemaType<typeof workspaceSchema>;

export const Workspace =
  mongoose.models.Workspace ||
  mongoose.model("Workspace", workspaceSchema);
