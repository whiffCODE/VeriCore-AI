
import mongoose from "mongoose";

const documentChunkSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    indexVersion: {
      type: String,
      required: true,
    },
    pageNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    sectionHeading: {
      type: String,
      default: "Unspecified section",
      maxlength: 200,
    },
    text: {
      type: String,
      required: true,
    },
    characterCount: {
      type: Number,
      required: true,
      min: 1,
    },
    embedding: {
      type: [Number],
      default: undefined,
      select: false,
    },
    embeddingModel: {
      type: String,
      default: null,
    },
    embeddingStatus: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

documentChunkSchema.index(
  { documentId: 1, indexVersion: 1, chunkIndex: 1 },
  { unique: true },
);

documentChunkSchema.index({ ownerId: 1, documentId: 1 });

export const DocumentChunk = mongoose.model(
  "DocumentChunk",
  documentChunkSchema,
);
