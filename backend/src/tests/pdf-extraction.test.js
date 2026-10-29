
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "../services/pdf-extraction.service.js";

describe("PDF extraction", () => {
  it("rejects an empty buffer", async () => {
    await expect(extractPdfPages(Buffer.alloc(0)))
      .rejects.toThrow("PDF_BUFFER_REQUIRED");
  });

  it("rejects a non-PDF buffer", async () => {
    await expect(
      extractPdfPages(Buffer.from("This is not a PDF")),
    ).rejects.toThrow("INVALID_PDF_SIGNATURE");
  });
});
