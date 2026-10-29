
import mongoose from "mongoose";

import { Document } from "../models/document.model.js";
import { DocumentChunk } from "../models/document-chunk.model.js";
import { embedText } from "./embedding.service.js";

const VECTOR_INDEX = "vericore_chunks_vector";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;

export async function retrieveEvidence({
  ownerId,
  question,
  documentIds,
  limit = DEFAULT_LIMIT,
}) {
  if (!mongoose.isValidObjectId(ownerId)) {
    throw new Error("INVALID_OWNER_ID");
  }

  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

  const documentFilter = {
    ownerId: ownerObjectId,
    status: "ready",
    currentIndexVersion: { $type: "string" },
  };

  if (documentIds?.length) {
    const requestedIds = documentIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    documentFilter._id = { $in: requestedIds };
  }

  const documents = await Document.find(documentFilter)
    .select("_id originalName currentIndexVersion")
    .lean();

  if (documents.length === 0) {
    return {
      evidence: [],
      documentCount: 0,
    };
  }

  const documentById = new Map(
    documents.map((document) => [
      String(document._id),
      document,
    ]),
  );

  const activeDocumentIds = documents.map(
    (document) => document._id,
  );

  const activeVersions = [
    ...new Set(
      documents.map((document) => document.currentIndexVersion),
    ),
  ];

  const queryVector = await embedText(question);

  const chunks = await DocumentChunk.aggregate([
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(safeLimit * 20, 100),
        limit: safeLimit,
        filter: {
          $and: [
            { ownerId: { $eq: ownerObjectId } },
            { documentId: { $in: activeDocumentIds } },
            { indexVersion: { $in: activeVersions } },
            { embeddingStatus: { $eq: "ready" } },
          ],
        },
      },
    },
    {
      $project: {
        documentId: 1,
        pageNumber: 1,
        chunkIndex: 1,
        sectionHeading: 1,
        text: 1,
        indexVersion: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  const evidence = chunks
    .filter((chunk) => {
      const document = documentById.get(
        String(chunk.documentId),
      );

      // Defense in depth: require the exact active version for this document.
      return (
        document &&
        String(document._id) === String(chunk.documentId) &&
        document.currentIndexVersion === chunk.indexVersion
      );
    })
    .map((chunk) => {
      const document = documentById.get(
        String(chunk.documentId),
      );

      return {
        documentId: String(chunk.documentId),
        documentName: document.originalName,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        sectionHeading: chunk.sectionHeading,
        text: chunk.text,
        score: chunk.score,
      };
    });

  return {
    evidence,
    documentCount: documents.length,
  };
}
