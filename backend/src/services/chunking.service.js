
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 180;

function normalizeText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyHeading(line) {
  const value = line.trim();

  if (!value || value.length > 120) return false;

  return (
    /^(?:section|chapter|appendix)\s+[\w.-]+/i.test(value) ||
    /^\d+(?:\.\d+)*[.)]?\s+\S/.test(value) ||
    /^[A-Z][A-Z0-9\s/&(),:.-]{4,}$/.test(value)
  );
}

function splitAtWordBoundary(text, maxSize) {
  if (text.length <= maxSize) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > maxSize) {
    let cut = remaining.lastIndexOf(" ", maxSize);

    if (cut < Math.floor(maxSize * 0.5)) {
      cut = maxSize;
    }

    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);

  return parts;
}

function makeOverlappingChunks(text, maxSize, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxSize, text.length);

    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > start + Math.floor(maxSize * 0.5)) {
        end = space;
      }
    }

    const value = text.slice(start, end).trim();

    if (value) chunks.push(value);
    if (end >= text.length) break;

    const nextStart = Math.max(start + 1, end - overlap);
    start = nextStart;
  }

  return chunks;
}

export function chunkPages(
  pages,
  {
    maxChunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
  } = {},
) {
  if (
    !Number.isInteger(maxChunkSize) ||
    maxChunkSize < 200 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap >= maxChunkSize
  ) {
    throw new Error("INVALID_CHUNKING_OPTIONS");
  }

  const output = [];
  let currentSection = "Unspecified section";

  const sortedPages = [...pages].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );

  for (const page of sortedPages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      throw new Error("INVALID_PAGE_NUMBER");
    }

    const lines = normalizeText(page.text ?? "").split("\n");
    let bodyLines = [];


const flushBody = () => {
  const body = bodyLines.join("\n").trim();
  bodyLines = [];

  if (!body) return;

  const textChunks = makeOverlappingChunks(
    body,
    maxChunkSize,
    overlap,
  );

  for (const text of textChunks) {
    output.push({
      pageNumber: page.pageNumber,
      sectionHeading: currentSection,
      text,
      characterCount: text.length,
    });
  }
};


    for (const line of lines) {
      const trimmed = line.trim();

      if (isLikelyHeading(trimmed)) {
        flushBody();
        currentSection = trimmed;
      } else if (trimmed) {
        bodyLines.push(trimmed);
      }
    }

    flushBody();
  }

  return output.map((chunk, index) => ({
    ...chunk,
    chunkIndex: index,
  }));
}
