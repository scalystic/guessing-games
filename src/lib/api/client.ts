import type { ApiResponse } from "@/lib/api/response";

/// Server-side fetches need an absolute URL — there is no origin to resolve a
/// relative path against outside the browser.
///
/// In the browser the relative path is used as-is. Not just for tidiness: going
/// through NEXT_PUBLIC_APP_URL there would send the request to whatever origin
/// was baked in at build time, so a preview deployment or a plain
/// localhost-vs-127.0.0.1 mismatch turns every same-origin call into a
/// cross-origin one and drops the session cookie.
function resolve(path: string): string {
  if (typeof window !== "undefined") return path;

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
async function unwrap<T>(
  response: Response,
  label: string,
): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      response.status,
      "invalid_response",
      `${label} returned a non-JSON body.`,
    );
  }

  if ("error" in body) {
    throw new ApiError(response.status, body.error.code, body.error.message);
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "unexpected_status",
      `${label} failed with ${response.status}.`,
    );
  }

  return body.data;
}

export async function apiGet<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    headers: { accept: "application/json" },
    ...init,
  });

  return unwrap<T>(response, `GET ${path}`);
}

/// JSON POST. `init.headers` is merged rather than spread over, so a caller
/// passing an Authorization header doesn't silently drop the content type.
export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    method: "POST",
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...init?.headers,
    },
    body: JSON.stringify(body),
  });

  return unwrap<T>(response, `POST ${path}`);
}
