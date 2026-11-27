// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
//
// VITE_BACKEND_URL is a DEVELOPMENT convenience only (e.g. http://localhost:8001).
// Production always uses the relative /api path: frontend/vercel.json rewrites it to
// Render, which keeps API calls — and Clerk's session cookie — on the frontend origin.
// Ignoring the variable in production means a stale Vercel env var can no longer break
// the deploy with CORS errors or a cross-origin Clerk proxy.
const backendUrl = import.meta.env.DEV ? (import.meta.env.VITE_BACKEND_URL ?? "") : "";
export const API_BASE = `${backendUrl.replace(/\/+$/, "")}/api`;
const BASE = API_BASE;

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    // Show the backend's friendly message (e.g. "AI is busy, please try again in a minute.")
    const detail = (body as { detail?: unknown } | null)?.detail;
    super(typeof detail === "string" ? detail : `request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

// Emergent-managed sign-in (Clerk): AuthTokenBridge registers Clerk's getToken here so
// every request carries `Authorization: Bearer <session token>` for the backend.
let tokenGetter: (() => Promise<string | null>) | null = null;
export function setAuthTokenGetter(fn: (() => Promise<string | null>) | null) {
  tokenGetter = fn;
}

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const token = tokenGetter ? await tokenGetter().catch(() => null) : null;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { detail: "Cannot reach the server. Check your internet connection and try again." });
  }

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
