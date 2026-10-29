
export function buildEvidencePackage(retrievedEvidence) {
  const seen = new Set();

  const sources = retrievedEvidence
    .filter((item) => {
      const key = `${item.documentId}:${item.pageNumber}:${item.chunkIndex}`;

      if (seen.has(key)) return false;
      seen.add(key);

      return (
        typeof item.text === "string" &&
        item.text.trim().length > 0 &&
        Number.isInteger(item.pageNumber) &&
        item.pageNumber >= 1 &&
        typeof item.documentName === "string"
      );
    })
    .slice(0, 8)
    .map((item, index) => ({
      citationId: `S${index + 1}`,
      documentId: item.documentId,
      documentName: item.documentName,
      pageNumber: item.pageNumber,
      sectionHeading: item.sectionHeading || "Unspecified section",
      chunkIndex: item.chunkIndex,
      text: item.text,
    }));

  return {
    sources,
    byId: new Map(sources.map((source) => [source.citationId, source])),
  };
}

export function validateCitationIds(answer, knownSourceIds) {
  const inlineIds = [
    ...new Set(
      [...answer.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]),
    ),
  ];

  const unknownIds = inlineIds.filter((id) => !knownSourceIds.has(id));

  return {
    valid: unknownIds.length === 0,
    inlineIds,
    unknownIds,
  };
}
