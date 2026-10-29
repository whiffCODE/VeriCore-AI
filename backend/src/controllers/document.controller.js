
import { Document } from "../models/document.model.js";
import { DocumentPage } from "../models/document-page.model.js";
import { DocumentChunk } from "../models/document-chunk.model.js";

import {
  storePdf,
  deleteStoredPdf,
  readStoredPdf,
} from "../services/document-storage.service.js";

import { extractPdfPages } from "../services/pdf-extraction.service.js";
import { indexDocument } from "../services/document-indexing.service.js";

function getOwnerId(req) {
  return req.user?._id ?? req.user?.id;
}

function safeExtractionError(error) {
  const code = error?.message;

  if (code === "PDF_PAGE_LIMIT_EXCEEDED") {
    return {
      status: 413,
      code,
      message: "The PDF exceeds the permitted page limit.",
    };
  }

  if (
    code === "PDF_PAGE_TEXT_LIMIT_EXCEEDED" ||
    code === "PDF_TOTAL_TEXT_LIMIT_EXCEEDED"
  ) {
    return {
      status: 413,
      code,
      message: "The PDF exceeds the permitted text-processing limit.",
    };
  }

  if (code === "INVALID_PDF_SIGNATURE") {
    return {
      status: 415,
      code,
      message: "The uploaded file is not a valid PDF.",
    };
  }

  if (code === "OCR_REQUIRED") {
    return {
      status: 422,
      code,
      message: "This PDF needs OCR before it can be indexed.",
    };
  }

  if (code === "DOCUMENT_PAGES_NOT_FOUND") {
    return {
      status: 422,
      code,
      message: "No extracted pages were found. Please re-upload the PDF.",
    };
  }

  return {
    status: 422,
    code: "PDF_EXTRACTION_FAILED",
    message:
      "The PDF could not be processed. It may be corrupt, encrypted, or unsupported.",
  };
}

function sendSafeProcessingError(res, error) {
  const knownErrors = new Set([
    "PDF_PAGE_LIMIT_EXCEEDED",
    "PDF_PAGE_TEXT_LIMIT_EXCEEDED",
    "PDF_TOTAL_TEXT_LIMIT_EXCEEDED",
    "INVALID_PDF_SIGNATURE",
    "OCR_REQUIRED",
    "DOCUMENT_PAGES_NOT_FOUND",
  ]);

  if (!knownErrors.has(error?.message)) {
    return false;
  }

  const safeError = safeExtractionError(error);

  res.status(safeError.status).json({
    error: {
      code: safeError.code,
      message: safeError.message,
    },
  });

  return true;
}

/**
 * POST /api/documents
 *
 * Upload PDF -> store PDF -> extract pages -> persist pages
 * -> chunk text -> generate embeddings -> activate index.
 *
 * Expects an authenticated request with multipart field "file".
 */
export async function uploadDocument(req, res, next) {
  let storedFile;
  let document;
  let pagesPersisted = false;
  let indexingStarted = false;

  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: {
          code: "PDF_REQUIRED",
          message: "Upload a PDF in the 'file' field.",
        },
      });
    }

    // 1. Store the file using a server-generated filename.
    storedFile = await storePdf(req.file.buffer);

    // 2. Create the document record.
    document = await Document.create({
      ownerId,
      originalName: req.file.originalname,
      storageKey: storedFile.storageKey,
      mimeType: "application/pdf",
      sizeBytes: req.file.size,
      sha256: storedFile.sha256,
      status: "processing",
      pageCount: null,
      chunkCount: 0,
      errorMessage: null,
    });

    // 3. Read from storage and extract page-aware text.
    const fileBuffer = await readStoredPdf(storedFile.storageKey);
    const extraction = await extractPdfPages(fileBuffer);

    // 4. Persist the extracted pages with original PDF page numbers.
    await DocumentPage.deleteMany({
      documentId: document._id,
      ownerId,
    });

    if (extraction.pages.length > 0) {
      await DocumentPage.insertMany(
        extraction.pages.map((page) => ({
          documentId: document._id,
          ownerId,
          pageNumber: page.pageNumber,
          text: page.text,
          characterCount: page.characterCount,
          hasText: page.hasText,
        })),
        { ordered: true },
      );
    }

    pagesPersisted = true;

    await Document.updateOne(
      {
        _id: document._id,
        ownerId,
      },
      {
        $set: {
          pageCount: extraction.pageCount,
          chunkCount: 0,
          status: "processing",
          errorMessage: null,
        },
      },
    );

    // 5. Chunk the saved pages and generate embeddings.
    // The indexing service manages its own status and failure recovery.
    indexingStarted = true;

    const indexingResult = await indexDocument({
      documentId: document._id,
      ownerId,
    });

    // 6. Return the actual final indexing result.
    return res.status(201).json({
      message: "PDF uploaded, extracted, chunked, and indexed successfully.",
      document: {
        id: String(document._id),
        originalName: document.originalName,
        status: indexingResult.status,
        pageCount: indexingResult.pageCount,
        chunkCount: indexingResult.chunkCount,
        indexVersion: indexingResult.indexVersion,
        pagesWithText: extraction.pagesWithText,
        pagesWithoutText: extraction.pagesWithoutText,
        totalCharacters: extraction.totalCharacters,
        requiresOcr: extraction.requiresOcr,
      },
    });
  } catch (error) {
    if (document && !indexingStarted) {
      // Extraction or page persistence failed.
      // Keep the document record and PDF for diagnosis/reprocessing,
      // but remove incomplete page records.
      if (!pagesPersisted) {
        await DocumentPage.deleteMany({
          documentId: document._id,
        }).catch(() => {});
      }

      await Document.updateOne(
        { _id: document._id },
        {
          $set: {
            status: "failed",
            errorMessage: "PDF extraction or page persistence failed.",
          },
        },
      ).catch(() => {});
    } else if (!document && storedFile?.storageKey) {
      // No document record was created, so avoid leaving an orphaned PDF.
      await deleteStoredPdf(storedFile.storageKey).catch(() => {});
    }

    if (sendSafeProcessingError(res, error)) {
      return;
    }

    // Do not overwrite the indexing service's failure status here.
    // It is responsible for retaining the previous active index.
    if (indexingStarted) {
      return res.status(500).json({
        error: {
          code: "DOCUMENT_INDEXING_FAILED",
          message: "Document indexing failed. Please retry indexing.",
        },
      });
    }

    next(error);
  }
}

/**
 * GET /api/documents
 */
export async function listDocuments(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    const documents = await Document.find({ ownerId })
      .select(
        "originalName mimeType sizeBytes status pageCount chunkCount errorMessage createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ documents });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/documents/:documentId
 */
export async function getDocument(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    const document = await Document.findOne({
      _id: req.params.documentId,
      ownerId,
    })
      .select(
        "originalName mimeType sizeBytes status pageCount chunkCount errorMessage createdAt updatedAt",
      )
      .lean();

    if (!document) {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    return res.status(200).json({ document });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    next(error);
  }
}

/**
 * POST /api/documents/:documentId/reindex
 */
export async function reindexDocument(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    const document = await Document.findOne({
      _id: req.params.documentId,
      ownerId,
    });

    if (!document) {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    const result = await indexDocument({
      documentId: document._id,
      ownerId,
    });

    return res.status(200).json({
      message: "Document indexed successfully.",
      result,
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    if (sendSafeProcessingError(res, error)) {
      return;
    }

    if (error?.message === "DOCUMENT_NOT_FOUND") {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "DOCUMENT_INDEXING_FAILED",
        message: "Document indexing failed. Please retry.",
      },
    });
  }
}

/**
 * DELETE /api/documents/:documentId
 */
export async function deleteDocument(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in.",
        },
      });
    }

    const document = await Document.findOne({
      _id: req.params.documentId,
      ownerId,
    });

    if (!document) {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    // Remove all searchable data owned by this document.
    await Promise.all([
      DocumentPage.deleteMany({
        documentId: document._id,
        ownerId,
      }),
      DocumentChunk.deleteMany({
        documentId: document._id,
        ownerId,
      }),
    ]);

    await document.deleteOne();

    try {
      await deleteStoredPdf(document.storageKey);
    } catch (error) {
      // Log this in production and let an orphan-file cleanup job retry.
      console.error("Document storage cleanup failed", {
        documentId: String(document._id),
        errorCode: error?.code ?? "STORAGE_CLEANUP_FAILED",
      });
    }

    return res.status(200).json({
      message: "Document deleted successfully.",
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found.",
        },
      });
    }

    next(error);
  }
}
