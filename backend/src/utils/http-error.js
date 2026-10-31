export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}
