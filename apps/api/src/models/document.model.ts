
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const documentSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      maxlength: 120,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    storageKey: {
      type: String,
      required: true,
      select: false,
    },
    sha256: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    currentVersion: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: [
        "uploaded",
        "queued",
        "processing",
        "ready",
        "failed",
        "archived",
      ],
      default: "uploaded",
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

documentSchema.index({ workspaceId: 1, createdAt: -1 });
documentSchema.index({ workspaceId: 1, status: 1 });
documentSchema.index({ workspaceId: 1, sha256: 1 });

export type DocumentDocument = InferSchemaType<typeof documentSchema>;

export const Document =
  mongoose.models.Document ||
  mongoose.model("Document", documentSchema);
