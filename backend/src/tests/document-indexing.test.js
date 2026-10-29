
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
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

vi.mock("../services/embedding.service.js", () => ({
  EMBEDDING_MODEL: "test-embedding-model",
  embedText: vi.fn(async () => Array(384).fill(0.01)),
}));

import { embedText } from "../services/embedding.service.js";
import { Document } from "../models/document.model.js";
import { DocumentPage } from "../models/document-page.model.js";
import { DocumentChunk } from "../models/document-chunk.model.js";
import { indexDocument } from "../services/document-indexing.service.js";

let mongo;
let ownerId;

async function createTestDocument() {
  const document = await Document.create({
    ownerId,
    originalName: "purchase-policy.pdf",
    storageKey: "12345678-1234-4234-8234-123456789012.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    status: "processing",
  });

  await DocumentPage.create([
    {
      documentId: document._id,
      ownerId,
      pageNumber: 1,
      text: "1. Purpose\nThis policy describes the purchase approval process.",
      characterCount: 61,
      hasText: true,
    },
    {
      documentId: document._id,
      ownerId,
      pageNumber: 2,
      text: "A manager must approve requests exceeding the threshold.",
      characterCount: 56,
      hasText: true,
    },
  ]);

  return document;
}

describe("document indexing", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    await Promise.all([
      Document.init(),
      DocumentPage.init(),
      DocumentChunk.init(),
    ]);
  });

  beforeEach(() => {
    ownerId = new mongoose.Types.ObjectId();
    embedText.mockReset();
    embedText.mockResolvedValue(Array(384).fill(0.01));
  });

  afterEach(async () => {
    await Promise.all([
      Document.deleteMany({}),
      DocumentPage.deleteMany({}),
      DocumentChunk.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("persists embedded chunks and marks the document ready", async () => {
    const document = await createTestDocument();

    const result = await indexDocument({
      documentId: document._id,
      ownerId,
    });

    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBeGreaterThan(0);

    const savedDocument = await Document.findById(document._id);
    expect(savedDocument.status).toBe("ready");
    expect(savedDocument.currentIndexVersion).toBe(result.indexVersion);

    const chunks = await DocumentChunk.find({
      documentId: document._id,
      indexVersion: result.indexVersion,
    }).select("+embedding");

    expect(chunks.length).toBe(result.chunkCount);
    expect(chunks.every((chunk) => chunk.embedding.length === 384)).toBe(true);
    expect(chunks.every((chunk) => chunk.embeddingStatus === "ready")).toBe(true);
    expect(chunks.every((chunk) => chunk.pageNumber >= 1)).toBe(true);
  });

  it("preserves the previous index if re-indexing fails", async () => {
    const document = await createTestDocument();

    const first = await indexDocument({
      documentId: document._id,
      ownerId,
    });

    embedText.mockRejectedValueOnce(new Error("Simulated model failure"));

    await expect(
      indexDocument({
        documentId: document._id,
        ownerId,
      }),
    ).rejects.toThrow("Simulated model failure");

    const savedDocument = await Document.findById(document._id);

    expect(savedDocument.status).toBe("ready");
    expect(savedDocument.currentIndexVersion).toBe(first.indexVersion);

    const activeChunks = await DocumentChunk.countDocuments({
      documentId: document._id,
      indexVersion: first.indexVersion,
    });

    expect(activeChunks).toBe(first.chunkCount);

    const failedGenerationChunks = await DocumentChunk.countDocuments({
      documentId: document._id,
      indexVersion: { $ne: first.indexVersion },
    });

    expect(failedGenerationChunks).toBe(0);
  });
});
