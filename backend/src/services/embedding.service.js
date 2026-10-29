
import { pipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

let extractorPromise;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      EMBEDDING_MODEL,
    ).catch((error) => {
      // Permit retry if initial model loading fails.
      extractorPromise = undefined;
      throw error;
    });
  }

  return extractorPromise;
}

export async function embedText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("EMBEDDING_TEXT_REQUIRED");
  }

  const extractor = await getExtractor();

  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });

  const vector = Array.from(output.data);

  if (
    vector.length !== EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("INVALID_EMBEDDING_VECTOR");
  }

  return vector;
}
