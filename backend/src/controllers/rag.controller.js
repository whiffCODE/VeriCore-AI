
import { retrieveEvidence } from "../services/rag-retrieval.service.js";
import { buildEvidencePackage } from "../services/rag-evidence.service.js";
import { generateGroundedAnswer } from "../services/answer-generation.service.js";

function getOwnerId(req) {
  return req.user?._id ?? req.user?.id;
}

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  });
}

const CONFIGURATION_ERRORS = new Set([
  "GEMINI_NOT_CONFIGURED",
  "GROQ_NOT_CONFIGURED",
  "CLAUDE_NOT_CONFIGURED",
  "OPENAI_NOT_CONFIGURED",
  "CLAUDE_MODEL_NOT_CONFIGURED",
  "OPENAI_MODEL_NOT_CONFIGURED",
]);

const SUPPORTED_PROVIDERS = new Set([
  "gemini",
  "groq",
  "claude",
  "openai",
]);

const UNSUPPORTED_ANSWER =
  "I couldn't produce a sufficiently supported answer from the retrieved SOP passages. Please consult the source documents or refine your question.";

function getInlineCitationIds(answer) {
  return [...answer.matchAll(/\[(S\d+)\]/g)].map(
    (match) => match[1],
  );
}

export async function retrieveForQuestion(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return sendError(
        res,
        401,
        "UNAUTHENTICATED",
        "Please sign in to ask a question.",
      );
    }

    const { question, documentIds } = req.body;

    const result = await retrieveEvidence({
      ownerId,
      question,
      documentIds,
      limit: 8,
    });

    const { sources } = buildEvidencePackage(result.evidence);

    return res.status(200).json({
      question,
      evidence: sources.map((source) => ({
        citationId: source.citationId,
        documentId: source.documentId,
        documentName: source.documentName,
        pageNumber: source.pageNumber,
        sectionHeading: source.sectionHeading,
        text: source.text,
      })),
      evidenceCount: sources.length,
      hasEvidence: sources.length > 0,
    });
  } catch (error) {
    if (error.message === "INVALID_OWNER_ID") {
      return sendError(
        res,
        401,
        "INVALID_SESSION",
        "Please sign in again.",
      );
    }

    return next(error);
  }
}

export async function askQuestion(req, res, next) {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return sendError(
        res,
        401,
        "UNAUTHENTICATED",
        "Please sign in to ask a question.",
      );
    }

    const {
      question,
      documentIds,
      provider = "gemini",
    } = req.body;

    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return sendError(
        res,
        400,
        "UNSUPPORTED_LLM_PROVIDER",
        "Select Gemini, Groq, Claude, or OpenAI.",
      );
    }

    const retrieval = await retrieveEvidence({
      ownerId,
      question,
      documentIds,
      limit: 8,
    });

    const { sources } = buildEvidencePackage(retrieval.evidence);

    const generated = await generateGroundedAnswer({
      question,
      sources,
      provider,
    });

    // An abstention must not return citations as if an answer were supported.
    if (generated.insufficientEvidence) {
      return res.status(200).json({
        question,
        answer: generated.answer || UNSUPPORTED_ANSWER,
        insufficientEvidence: true,
        citations: [],
        evidenceCount: sources.length,
        provider,
      });
    }

    const sourceMap = new Map(
      sources.map((source) => [source.citationId, source]),
    );

    // Every non-abstaining answer must contain an inline citation.
    const inlineCitationIds = getInlineCitationIds(generated.answer);

    if (inlineCitationIds.length === 0) {
      return res.status(200).json({
        question,
        answer: UNSUPPORTED_ANSWER,
        insufficientEvidence: true,
        citations: [],
        evidenceCount: sources.length,
        provider,
      });
    }

    // Reject any inline citation that was not assigned to retrieved evidence.
    const hasUnknownInlineCitation = inlineCitationIds.some(
      (citationId) => !sourceMap.has(citationId),
    );

    if (hasUnknownInlineCitation) {
      throw new Error("INVALID_CITATION_REFERENCE");
    }

    // Include only citations actually referenced inline in the answer.
    const citationIds = [...new Set(inlineCitationIds)];

    const citations = citationIds.map((citationId) => {
      const source = sourceMap.get(citationId);

      return {
        citationId,
        documentId: source.documentId,
        documentName: source.documentName,
        pageNumber: source.pageNumber,
        sectionHeading: source.sectionHeading,
      };
    });

    return res.status(200).json({
      question,
      answer: generated.answer,
      insufficientEvidence: false,
      citations,
      evidenceCount: sources.length,
      provider,
    });
  } catch (error) {
    if (error.message === "INVALID_OWNER_ID") {
      return sendError(
        res,
        401,
        "INVALID_SESSION",
        "Please sign in again.",
      );
    }

    if (CONFIGURATION_ERRORS.has(error.message)) {
      return sendError(
        res,
        503,
        "LLM_NOT_CONFIGURED",
        "The selected AI provider or model is not configured.",
      );
    }

    if (error.message === "UNSUPPORTED_LLM_PROVIDER") {
      return sendError(
        res,
        400,
        "UNSUPPORTED_LLM_PROVIDER",
        "Select Gemini, Groq, Claude, or OpenAI.",
      );
    }

    if (error.message === "LLM_PROVIDER_UNAVAILABLE") {
      return sendError(
        res,
        503,
        "LLM_PROVIDER_UNAVAILABLE",
        "The AI provider is temporarily unavailable. Please retry.",
      );
    }

    if (error.message === "INVALID_MODEL_RESPONSE") {
      return sendError(
        res,
        502,
        "LLM_INVALID_RESPONSE",
        "The AI provider returned an unusable response.",
      );
    }

    if (error.message === "INVALID_CITATION_REFERENCE") {
      return sendError(
        res,
        502,
        "INVALID_CITATION_REFERENCE",
        "The generated answer contained an invalid citation reference.",
      );
    }

    return next(error);
  }
}
