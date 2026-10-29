
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../middleware/require-auth.js", () => ({
  requireAuth(req, res, next) {
    const userId = req.headers["x-test-user-id"];

    if (!userId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    req.user = { _id: userId };
    next();
  },
}));

vi.mock("../services/embedding.service.js", () => ({
  EMBEDDING_MODEL: "test-embedding-model",
  EMBEDDING_DIMENSIONS: 384,
  embedText: vi.fn(async () => Array(384).fill(0.01)),
}));

import ragRoutes from "../routes/rag.routes.js";
import { Document } from "../models/document.model.js";
import { DocumentChunk } from "../models/document-chunk.model.js";
import { embedText } from "../services/embedding.service.js";

let mongo;
let app;
let aggregateSpy;

let ownerId;
let otherOwnerId;
let documentId;
let otherDocumentId;

function createApp() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api/rag", ragRoutes);
  return instance;
}

async function createDocument({
  owner = ownerId,
  id = new mongoose.Types.ObjectId(),
  version = "index-v1",
  name = "Purchase Policy.pdf",
} = {}) {
  return Document.create({
    _id: id,
    ownerId: owner,
    originalName: name,
    storageKey: `${randomUUID()}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    status: "ready",
    pageCount: 3,
    chunkCount: 2,
    currentIndexVersion: version,
  });
}

function createRetrievedChunk({
  docId = documentId,
  version = "index-v1",
  pageNumber = 2,
  text = "Purchase requests above the threshold require manager approval.",
  score = 0.91,
  chunkOwnerId = ownerId,
} = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    documentId: new mongoose.Types.ObjectId(String(docId)),
    ownerId: new mongoose.Types.ObjectId(String(chunkOwnerId)),
    indexVersion: version,
    pageNumber,
    chunkIndex: 0,
    sectionHeading: "4.2 Approval Process",
    text,
    score,
  };
}

describe("POST /api/rag/retrieve", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    await Document.init();
    app = createApp();
  });

  beforeEach(async () => {
    ownerId = new mongoose.Types.ObjectId();
    otherOwnerId = new mongoose.Types.ObjectId();
    documentId = new mongoose.Types.ObjectId();
    otherDocumentId = new mongoose.Types.ObjectId();

    await Document.deleteMany({});

    embedText.mockReset();
    embedText.mockResolvedValue(Array(384).fill(0.01));

    aggregateSpy = vi
      .spyOn(DocumentChunk, "aggregate")
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .post("/api/rag/retrieve")
      .send({ question: "What approvals are required?" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(aggregateSpy).not.toHaveBeenCalled();
  });

  it("rejects a question that is too short", async () => {
    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({ question: "Hi" });

    expect(response.status).toBe(422);
    expect(aggregateSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed document IDs", async () => {
    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({
        question: "What is the approval process?",
        documentIds: ["not-a-valid-object-id"],
      });

    expect(response.status).toBe(422);
    expect(aggregateSpy).not.toHaveBeenCalled();
  });

  it("returns evidence with exact document and page citations", async () => {
    await createDocument({
      owner: ownerId,
      id: documentId,
      name: "Purchase Policy.pdf",
    });

    aggregateSpy.mockResolvedValue([
      createRetrievedChunk({
        docId: documentId,
        pageNumber: 7,
      }),
    ]);

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({
        question: "What approvals are required for a purchase request?",
      });

    expect(response.status).toBe(200);
    expect(response.body.hasEvidence).toBe(true);
    expect(response.body.evidenceCount).toBe(1);

    expect(response.body.evidence[0]).toMatchObject({
      citationId: "S1",
      documentId: String(documentId),
      documentName: "Purchase Policy.pdf",
      pageNumber: 7,
      sectionHeading: "4.2 Approval Process",
      text: "Purchase requests above the threshold require manager approval.",
    });

    expect(embedText).toHaveBeenCalledWith(
      "What approvals are required for a purchase request?",
    );
  });

  it("does not return evidence belonging to another user", async () => {
    await createDocument({
      owner: ownerId,
      id: documentId,
      name: "My Policy.pdf",
    });

    await createDocument({
      owner: otherOwnerId,
      id: otherDocumentId,
      name: "Private Policy.pdf",
    });

    aggregateSpy.mockResolvedValue([
      createRetrievedChunk({
        docId: otherDocumentId,
        chunkOwnerId: otherOwnerId,
        text: "Private company information.",
      }),
    ]);

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({ question: "What does the private policy say?" });

    expect(response.status).toBe(200);
    expect(response.body.evidence).toEqual([]);
    expect(response.body.hasEvidence).toBe(false);
  });

  it("does not return chunks from a stale index version", async () => {
    await createDocument({
      owner: ownerId,
      id: documentId,
      version: "index-v2",
    });

    aggregateSpy.mockResolvedValue([
      createRetrievedChunk({
        docId: documentId,
        version: "index-v1",
        text: "This passage belongs to an old index.",
      }),
      createRetrievedChunk({
        docId: documentId,
        version: "index-v2",
        text: "This passage belongs to the active index.",
      }),
    ]);

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({ question: "What is the current policy?" });

    expect(response.status).toBe(200);
    expect(response.body.evidenceCount).toBe(1);
    expect(response.body.evidence[0].text).toBe(
      "This passage belongs to the active index.",
    );
  });

  it("returns an empty evidence list when no chunks are relevant", async () => {
    await createDocument({
      owner: ownerId,
      id: documentId,
    });

    aggregateSpy.mockResolvedValue([]);

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({
        question: "What is the company's policy on lunar travel?",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      evidence: [],
      evidenceCount: 0,
      hasEvidence: false,
    });
  });

  it("does not search when selected documents belong to another user", async () => {
    await createDocument({
      owner: otherOwnerId,
      id: otherDocumentId,
      name: "Another User's Policy.pdf",
    });

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({
        question: "Summarize this document for me.",
        documentIds: [String(otherDocumentId)],
      });

    expect(response.status).toBe(200);
    expect(response.body.evidence).toEqual([]);
    expect(aggregateSpy).not.toHaveBeenCalled();
  });

  it("applies owner, document, active-version and embedding-status filters", async () => {
    await createDocument({
      owner: ownerId,
      id: documentId,
      version: "index-v3",
    });

    const response = await request(app)
      .post("/api/rag/retrieve")
      .set("x-test-user-id", String(ownerId))
      .send({ question: "Explain the approval process." });

    expect(response.status).toBe(200);

    const pipeline = aggregateSpy.mock.calls[0][0];
    const vectorStage = pipeline[0].$vectorSearch;

    expect(vectorStage.index).toBe("vericore_chunks_vector");
    expect(vectorStage.path).toBe("embedding");
    expect(vectorStage.queryVector).toHaveLength(384);

    const filters = vectorStage.filter.$and;

    expect(filters).toContainEqual({
      ownerId: { $eq: new mongoose.Types.ObjectId(String(ownerId)) },
    });

    expect(filters).toContainEqual({
      documentId: {
        $in: [new mongoose.Types.ObjectId(String(documentId))],
      },
    });

    expect(filters).toContainEqual({
      indexVersion: { $in: ["index-v3"] },
    });

    expect(filters).toContainEqual({
      embeddingStatus: { $eq: "ready" },
    });
  });
});
