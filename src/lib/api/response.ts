/// One envelope for every route handler, so clients can branch on the presence
/// of `data` vs `error` without special-casing per endpoint.
export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: {
    code: string;
    message: string;
    /// Per-field messages for a validation_error, keyed like
    /// zod's flatten().fieldErrors — optional so every other call site is
    /// unaffected.
    fieldErrors?: Record<string, string[]>;
  };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data } satisfies ApiSuccess<T>, init);
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return Response.json(
    { error: { code, message, fieldErrors } } satisfies ApiFailure,
    { status },
  );
}

export function notFoundJson(message: string): Response {
  return jsonError(404, "not_found", message);
}

/// Route handlers should never surface a driver error verbatim — log it server
/// side and hand the client a stable shape.
export function internalErrorJson(scope: string, error: unknown): Response {
  console.error(`[api:${scope}]`, error);
  return jsonError(500, "internal_error", "Something went wrong.");
}
