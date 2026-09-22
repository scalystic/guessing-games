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

/// Every request gets a ceiling. Without one a hung request — a flaky network,
/// a server that accepted the connection and then stalled — never rejects, so
/// the promise behind a skip, a guess or a typeahead lookup simply never
/// settles. On the client that leaves `pendingAction` stuck on, every button
/// disabled, and the deck frozen on "Unlocking…" until the player reloads the
/// page. This is the whole of the "loading just gets stuck, have to refresh"
/// report. 10s is generous for a call that normally answers in well under one —
/// it is a backstop against a dead request, not a latency budget.
const REQUEST_TIMEOUT_MS = 10_000;

/// fetch() with a timeout, honouring any signal the caller already passed.
///
/// The caller's own AbortController (the typeahead uses one to cancel a stale
/// lookup) still works: aborting it aborts this request too. A timeout is
/// reported as an ApiError so callers surface a real message and reset their
/// pending state, exactly as they do for any other failed request; a caller
/// abort is rethrown untouched so "I cancelled this" stays distinguishable
/// from "this timed out".
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const callerSignal = init?.signal ?? undefined;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (timedOut) {
      throw new ApiError(
        504,
        "timeout",
        "The server took too long to respond. Check your connection and try again.",
      );
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
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
  const response = await fetchWithTimeout(resolve(path), {
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
  const response = await fetchWithTimeout(resolve(path), {
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
