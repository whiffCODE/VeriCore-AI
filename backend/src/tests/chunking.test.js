
import { describe, expect, it } from "vitest";
import { chunkPages } from "../services/chunking.service.js";

describe("chunkPages", () => {
  it("preserves source page numbers", () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: "Purchase policy details." },
      { pageNumber: 2, text: "Manager approval is required." },
    ]);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.pageNumber === 1)).toBe(true);
    expect(chunks.some((chunk) => chunk.pageNumber === 2)).toBe(true);
  });

  it("recognizes a numbered section heading", () => {
    const chunks = chunkPages([
      {
        pageNumber: 7,
        text: "4.2 Approval Process\nThe manager must approve the request.",
      },
    ]);

    expect(chunks[0].sectionHeading).toBe("4.2 Approval Process");
  });

  it("does not create chunks for empty pages", () => {
    expect(
      chunkPages([{ pageNumber: 3, text: "   " }]),
    ).toEqual([]);
  });

  it("rejects invalid overlap settings", () => {
    expect(() =>
      chunkPages([], { maxChunkSize: 200, overlap: 200 }),
    ).toThrow("INVALID_CHUNKING_OPTIONS");
  });
});
