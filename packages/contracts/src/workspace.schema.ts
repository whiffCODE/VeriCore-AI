
import { z } from "zod";

export const CreateWorkspaceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Workspace name must contain at least 2 characters.")
      .max(80, "Workspace name cannot exceed 80 characters."),

    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters.")
      .optional(),
  })
  .strict();

export type CreateWorkspaceInput = z.infer<
  typeof CreateWorkspaceSchema
>;
