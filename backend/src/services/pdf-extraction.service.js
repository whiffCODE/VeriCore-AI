
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 2000;
const MAX_EXTRACTED_CHARACTERS = 20_000_000;
const MAX_PAGE_CHARACTERS = 2_000_000;

function normalizePageText(items) {
  const lines = [];
  let currentLine = "";

  for (const item of items) {
    if (typeof item.str !== "string") {
      continue;
    }

    currentLine += item.str;

    if (item.hasEOL) {
      lines.push(currentLine);
      currentLine = "";
    } else {
      // PDF text items frequently represent separate words or fragments.
      currentLine += " ";
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function extractPdfPages(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("PDF_BUFFER_REQUIRED");
  }

  // Reject obvious non-PDF files before invoking the parser.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("INVALID_PDF_SIGNATURE");
  }

  let pdf;
  let totalCharacters = 0;

  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      stopAtErrors: true,
      verbosity: 0,
    });

    pdf = await loadingTask.promise;

    if (pdf.numPages > MAX_PAGES) {
      throw new Error("PDF_PAGE_LIMIT_EXCEEDED");
    }

    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);

      try {
        const content = await page.getTextContent({
          includeMarkedContent: false,
        });

        const text = normalizePageText(content.items);

        if (text.length > MAX_PAGE_CHARACTERS) {
          throw new Error("PDF_PAGE_TEXT_LIMIT_EXCEEDED");
        }

        totalCharacters += text.length;

        if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
          throw new Error("PDF_TOTAL_TEXT_LIMIT_EXCEEDED");
        }

        pages.push({
          pageNumber,
          text,
          characterCount: text.length,
          hasText: text.length > 0,
        });
      } finally {
        page.cleanup();
      }
    }

    const pagesWithText = pages.filter((page) => page.hasText).length;
    const pagesWithoutText = pages.length - pagesWithText;

    return {
      pageCount: pdf.numPages,
      pages,
      totalCharacters,
      pagesWithText,
      pagesWithoutText,
      requiresOcr: pagesWithText === 0,
    };
  } catch (error) {
    if (error.message?.startsWith("PDF_") ||
        error.message === "INVALID_PDF_SIGNATURE") {
      throw error;
    }

    // Do not expose parser internals or document contents to API clients.
    throw new Error("PDF_EXTRACTION_FAILED", { cause: error });
  } finally {
    if (pdf) {
      await pdf.destroy();
    }
  }
}
