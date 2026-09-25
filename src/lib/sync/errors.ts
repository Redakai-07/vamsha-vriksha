/**
 * The one error type the engine treats as "try again later".
 *
 * Anything else is a bug or a rejected write and is surfaced rather than
 * retried forever. Messages deliberately carry no payloads: a family record must
 * never end up in a log line or a crash report.
 */
export class SyncTransportError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SyncTransportError";
  }
}

export function isTransportError(error: unknown): error is SyncTransportError {
  return error instanceof SyncTransportError || (error instanceof Error && error.name === "SyncTransportError");
}
