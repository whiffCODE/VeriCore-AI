
import { retrieveEvidence } from "../services/rag-retrieval.service.js";

export async function retrieveForQuestion(req, res, next) {
  try {
    const ownerId = req.user?._id ?? req.user?.id;

    if (!ownerId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in to ask a question.",
        },
      });
    }

    const { question, documentIds } = req.body;

    const result = await retrieveEvidence({
      ownerId,
      question,
      documentIds,
      limit: 8,
    });

    return res.status(200).json({
      question,
      evidence: result.evidence.map((item, index) => ({
        citationId: `S${index + 1}`,
        documentId: item.documentId,
        documentName: item.documentName,
        pageNumber: item.pageNumber,
        sectionHeading: item.sectionHeading,
        text: item.text,
        score: item.score,
      })),
      evidenceCount: result.evidence.length,
      hasEvidence: result.evidence.length > 0,
    });
  } catch (error) {
    if (error.message === "INVALID_OWNER_ID") {
      return res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Please sign in again.",
        },
      });
    }

    next(error);
  }
}
