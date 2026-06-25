/**
 * Typed errors for the CTG.EXCHANGE SDK.
 *
 * Every non-2xx REST response is thrown as an {@link ApiError} subclass
 * chosen by status code. The exchange returns a JSON error body
 * `{ error, message, request_id }` — `requestId` is surfaced on the
 * error; quote it when reporting a problem.
 */

/** Base class for every error thrown by this SDK. */
export class CtgExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A non-2xx HTTP response from the API. */
export class ApiError extends CtgExchangeError {
  readonly statusCode: number;
  readonly apiError?: string;
  readonly apiMessage?: string;
  readonly requestId?: string;

  constructor(
    statusCode: number,
    apiError?: string,
    apiMessage?: string,
    requestId?: string,
  ) {
    const detail = apiMessage ?? apiError ?? "request failed";
    const suffix = requestId ? ` (request_id=${requestId})` : "";
    super(`[${statusCode}] ${detail}${suffix}`);
    this.statusCode = statusCode;
    this.apiError = apiError;
    this.apiMessage = apiMessage;
    this.requestId = requestId;
  }
}

/** 400 — the request was malformed. */
export class BadRequestError extends ApiError {}

/** 401 — missing, expired, unknown or wrong-signature API key. */
export class AuthenticationError extends ApiError {}

/** 403 — the key lacks the required scope, or the IP is off-allowlist. */
export class PermissionDeniedError extends ApiError {}

/** 404 — unknown symbol or order. */
export class NotFoundError extends ApiError {}

/** 429 — per-key or per-IP rate limit exceeded. */
export class RateLimitError extends ApiError {
  /** The `Retry-After` header value in seconds, when the server sent one. */
  readonly retryAfter?: number;

  constructor(
    statusCode: number,
    apiError?: string,
    apiMessage?: string,
    requestId?: string,
    retryAfter?: number,
  ) {
    super(statusCode, apiError, apiMessage, requestId);
    this.retryAfter = retryAfter;
  }
}

/** 5xx — the API failed to handle a well-formed request. */
export class ServerError extends ApiError {}

interface ErrorBody {
  error?: string;
  message?: string;
  request_id?: string;
}

/** Map an HTTP status + JSON error body to the right error instance. */
export function errorFromResponse(
  statusCode: number,
  body: ErrorBody | undefined,
  retryAfter?: number,
): ApiError {
  const { error, message, request_id: requestId } = body ?? {};

  switch (statusCode) {
    case 400:
      return new BadRequestError(statusCode, error, message, requestId);
    case 401:
      return new AuthenticationError(statusCode, error, message, requestId);
    case 403:
      return new PermissionDeniedError(statusCode, error, message, requestId);
    case 404:
      return new NotFoundError(statusCode, error, message, requestId);
    case 429:
      return new RateLimitError(
        statusCode,
        error,
        message,
        requestId,
        retryAfter,
      );
    default:
      return statusCode >= 500
        ? new ServerError(statusCode, error, message, requestId)
        : new ApiError(statusCode, error, message, requestId);
  }
}
