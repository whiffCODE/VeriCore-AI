
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const evidenceSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    documentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentVersion",
      required: true,
    },
    pageNumber: {
      type: Number,
      min: 1,
      default: null,
    },
    section: {
      type: String,
      maxlength: 500,
      default: null,
    },
    blockId: {
      type: String,
      maxlength: 120,
      default: null,
    },
    evidenceType: {
      type: String,
      enum: ["paragraph", "table", "figure", "image", "other"],
      required: true,
    },
    excerpt: {
      type: String,
      maxlength: 3000,
      default: null,
    },
  },
  { _id: false, strict: "throw" },
);

const messageSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      immutable: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    evidence: {
      type: [evidenceSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["complete", "failed"],
      default: "complete",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

messageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;

export const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
