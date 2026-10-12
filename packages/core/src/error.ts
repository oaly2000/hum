/**
 * An error that maps to a specific HTTP status code. Rendering a route that
 * throws an `HttpError` renders the nearest `_error` page (or the default error
 * page) with the given status.
 */
export class HttpError extends Error {
  override name = "HttpError";
  status: number;

  constructor(status: number, message?: string, options?: ErrorOptions) {
    super(message ?? `HTTP error ${status}`, options);
    this.status = status;
  }
}

/** Thrown when a route file could not be loaded. */
export class RouteLoadError extends Error {
  override name = "RouteLoadError";
  constructor(file: string, cause: unknown) {
    super(
      `Failed to load route module "${file}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}
