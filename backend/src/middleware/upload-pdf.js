import multer from "multer";

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export const uploadPdf = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
    files: 1,
    fields: 5,
    parts: 6,
  },

  fileFilter(_req, file, callback) {
    if (
      file.mimetype !== "application/pdf" ||
      !file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      return callback(
        new Error("Only PDF files are accepted"),
      );
    }

    callback(null, true);
  },
});

export function verifyPdfSignature(req, res, next) {
  const buffer = req.file?.buffer;

  if (!buffer) {
    return res.status(400).json({
      error: {
        code: "PDF_REQUIRED",
        message: "Please upload a PDF file.",
      },
    });
  }

  // The declared MIME type alone is not trustworthy.
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    return res.status(415).json({
      error: {
        code: "INVALID_PDF",
        message: "The uploaded file is not a valid PDF file.",
      },
    });
  }

  next();
}
