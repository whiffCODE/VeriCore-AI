import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      maxlength: 255,
    },

    storageKey: {
      type: String,
      required: true,
      unique: true,
    },

    mimeType: {
      type: String,
      required: true,
      enum: ["application/pdf"],
    },

    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },

    sha256: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
      index: true,
    },

    pageCount: {
      type: Number,
      default: null,
      min: 0,
    },

    chunkCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    errorMessage: {
      type: String,
      default: null,
      maxlength: 500,
    },
    currentIndexVersion: {
  type: String,
  default: null,
},
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

documentSchema.index({ ownerId: 1, createdAt: -1 });
documentSchema.index({ ownerId: 1, sha256: 1 });

export const Document = mongoose.model("Document", documentSchema);
