
import { describe, expect, it } from "vitest";

import {
  buildEvidencePackage,
  validateCitationIds,
} from "../services/rag-evidence.service.js";

describe("RAG evidence and citation integrity", () => {
  const sampleEvidence = [
    {
      documentId: "doc-1",
      documentName: "Purchase Policy.pdf",
      pageNumber: 7,
      chunkIndex: 2,
      sectionHeading: "4.2 Approval Process",
      text: "Manager approval is required for this request.",
    },
  ];

  it("assigns a citation ID and preserves exact page metadata", () => {
    const { sources } = buildEvidencePackage(sampleEvidence);

    expect(sources[0]).toMatchObject({
      citationId: "S1",
      documentName: "Purchase Policy.pdf",
      pageNumber: 7,
      sectionHeading: "4.2 Approval Process",
    });
  });

  it("removes duplicate chunks", () => {
    const { sources } = buildEvidencePackage([
      ...sampleEvidence,
      ...sampleEvidence,
    ]);

    expect(sources).toHaveLength(1);
  });

  it("rejects unknown inline citation IDs", () => {
    const result = validateCitationIds(
      "Manager approval is required [S9].",
      new Set(["S1"]),
    );

    expect(result.valid).toBe(false);
    expect(result.unknownIds).toContain("S9");
  });

  it("accepts known inline citation IDs", () => {
    const result = validateCitationIds(
      "Manager approval is required [S1].",
      new Set(["S1"]),
    );

    expect(result.valid).toBe(true);
  });
});
