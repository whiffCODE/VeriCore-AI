
import type { ValidationIssue } from "@vericore/contracts";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: ValidationIssue[],
  ) {
    super(message);

    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
