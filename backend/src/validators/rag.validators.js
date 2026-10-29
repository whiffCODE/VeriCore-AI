
import { z } from "zod";

export const askQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Question must contain at least 3 characters.")
    .max(2000, "Question must not exceed 2000 characters."),
  documentIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .max(50)
    .optional(),
});
