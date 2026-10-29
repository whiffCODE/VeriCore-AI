
import mongoose from "mongoose";

const documentPageSchema = new mongoose.Schema(
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
    pageNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    text: {
      type: String,
      default: "",
    },
    characterCount: {
      type: Number,
      required: true,
      min: 0,
    },
    hasText: {
      type: Boolean,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

documentPageSchema.index(
  { documentId: 1, pageNumber: 1 },
  { unique: true },
);

documentPageSchema.index({ ownerId: 1, documentId: 1 });

export const DocumentPage = mongoose.model(
  "DocumentPage",
  documentPageSchema,
);
