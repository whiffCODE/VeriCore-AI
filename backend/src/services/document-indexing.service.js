
import { randomUUID } from "node:crypto";

import { Document } from "../models/document.model.js";
import { DocumentPage } from "../models/document-page.model.js";
import { DocumentChunk } from "../models/document-chunk.model.js";

import { chunkPages } from "./chunking.service.js";
import {
  embedText,
  EMBEDDING_MODEL,
} from "./embedding.service.js";

export async function indexDocument({ documentId, ownerId }) {
  const document = await Document.findOne({
    _id: documentId,
    ownerId,
  });

  if (!document) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }

  const previousVersion = document.currentIndexVersion;
  const nextVersion = randomUUID();

  await Document.updateOne(
    { _id: documentId, ownerId },
    { $set: { status: "processing", errorMessage: null } },
  );

  try {
    const pages = await DocumentPage.find({
      documentId,
      ownerId,
    })
      .sort({ pageNumber: 1 })
      .select("pageNumber text")
      .lean();

    if (pages.length === 0) {
      throw new Error("DOCUMENT_PAGES_NOT_FOUND");
    }

    const chunks = chunkPages(pages);

    if (chunks.length === 0) {
      throw new Error("OCR_REQUIRED");
    }

    // Persist the generation before embedding, so partial work is traceable.
    const records = await DocumentChunk.insertMany(
      chunks.map((chunk) => ({
        documentId,
        ownerId,
        indexVersion: nextVersion,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        sectionHeading: chunk.sectionHeading,
        text: chunk.text,
        characterCount: chunk.characterCount,
        embeddingStatus: "pending",
      })),
      { ordered: true },
    );

    for (const record of records) {
      try {
        const embedding = await embedText(record.text);

        await DocumentChunk.updateOne(
          {
            _id: record._id,
            documentId,
            ownerId,
            indexVersion: nextVersion,
          },
          {
            $set: {
              embedding,
              embeddingModel: EMBEDDING_MODEL,
              embeddingStatus: "ready",
            },
          },
        );
      } catch (error) {
        await DocumentChunk.updateOne(
          { _id: record._id },
          { $set: { embeddingStatus: "failed" } },
        ).catch(() => {});

        throw error;
      }
    }

    const update = await Document.updateOne(
      { _id: documentId, ownerId },
      {
        $set: {
          currentIndexVersion: nextVersion,
          status: "ready",
          pageCount: pages.length,
          chunkCount: records.length,
          errorMessage: null,
        },
      },
    );

    if (update.matchedCount !== 1) {
      throw new Error("DOCUMENT_UPDATE_FAILED");
    }

    // The active version is switched. Clean up older generations afterward.
    // Cleanup failure must not invalidate the newly activated index.
    await DocumentChunk.deleteMany({
      documentId,
      indexVersion: { $ne: nextVersion },
    }).catch(() => {});

    return {
      documentId: String(documentId),
      indexVersion: nextVersion,
      pageCount: pages.length,
      chunkCount: records.length,
      status: "ready",
    };
  } catch (error) {
    await DocumentChunk.deleteMany({
      documentId,
      indexVersion: nextVersion,
    }).catch(() => {});

    await Document.updateOne(
      { _id: documentId, ownerId },
      {
        $set: {
          status: previousVersion ? "ready" : "failed",
          errorMessage:
            error.message === "OCR_REQUIRED"
              ? "No selectable text was found. OCR is required."
              : "Document indexing failed. Please retry.",
        },
      },
    ).catch(() => {});

    throw error;
  }
}
