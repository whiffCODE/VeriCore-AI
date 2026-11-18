
import type { RequestHandler } from "express";
import { z } from "@vericore/contracts";

import { AppError } from "../utils/app-error.js";

type RequestPart = "body" | "query" | "params";

type ValidationSchemas = Partial<
  Record<RequestPart, z.ZodType>
>;

export function validateRequest(
  schemas: ValidationSchemas,
): RequestHandler {
  return (req, res, next) => {
    const validated: Partial<Record<RequestPart, unknown>> = {};

    const parts: RequestPart[] = ["body", "query", "params"];

    for (const part of parts) {
      const schema = schemas[part];

      if (!schema) {
        continue;
      }

      const result = schema.safeParse(req[part]);

      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
        }));

        next(
          new AppError(
            400,
            "Request validation failed.",
            details,
          ),
        );

        return;
      }

      validated[part] = result.data;
    }

    res.locals.validated = validated;

    next();
  };
}
