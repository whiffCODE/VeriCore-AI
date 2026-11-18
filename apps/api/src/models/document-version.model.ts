
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const documentVersionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      immutable: true,
    },
    version: {
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
    processingStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      required: true,
    },
    processingError: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    processedAt: {
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

documentVersionSchema.index(
  { workspaceId: 1, documentId: 1, version: 1 },
  { unique: true },
);

export type DocumentVersionDocument =
  InferSchemaType<typeof documentVersionSchema>;

export const DocumentVersion =
  mongoose.models.DocumentVersion ||
  mongoose.model("DocumentVersion", documentVersionSchema);
