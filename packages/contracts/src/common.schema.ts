
import { z } from "zod";

export const HealthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal("healthy"),
    service: z.string(),
    version: z.string(),
    timestamp: z.string(),
  }),
});

export const ValidationIssueSchema = z.object({
  path: z.array(z.string()),
  message: z.string(),
});

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    details: z.array(ValidationIssueSchema).optional(),
  }),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
