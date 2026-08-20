export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;


    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request") {
    super(message, 400);
  }
}

/**
 * Raised when Kubernetes provisioning fails (image pull errors, crash loops,
 * unschedulable pods, or timeouts). This is client-facing (422) because the
 * requested sandbox could not be brought up - e.g. the image does not exist
 * or cannot run with the hardened security context.
 */
export class ProvisioningError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

export interface ProvisionExtractionDetails {
  reason: string;
  issues: string[];
  retryable: boolean;
}

/**
 * Raised when the LLM fails to produce valid provisioning parameters (network,
 * validation, or empty response). Carries structured details so clients can
 * distinguish retryable failures from hard errors.
 */
export class ProvisionExtractionError extends AppError {
  public readonly details: ProvisionExtractionDetails;

  constructor(details: ProvisionExtractionDetails) {
    super(details.issues[0] ?? "Failed to extract provisioning parameters.", 502);
    this.details = details;
  }
}
