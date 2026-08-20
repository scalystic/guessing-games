import type { ApiResponse } from "@/lib/api/response";

/// Server-side fetches need an absolute URL — there is no origin to resolve a
/// relative path against outside the browser.
function resolve(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;

  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — the server cannot resolve API URLs.",
    );
  }

  return new URL(path, base).toString();
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/// Unwraps the { data } / { error } envelope so callers get the payload or an
/// ApiError, never a half-parsed Response.
export async function apiGet<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    headers: { accept: "application/json" },
    ...init,
  });

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      response.status,
      "invalid_response",
      `GET ${path} returned a non-JSON body.`,
    );
  }

  if ("error" in body) {
    throw new ApiError(response.status, body.error.code, body.error.message);
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "unexpected_status",
      `GET ${path} failed with ${response.status}.`,
    );
  }

  return body.data;
}
