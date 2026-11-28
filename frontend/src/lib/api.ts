import { clearSession, readSession, writeSession, type Session } from "./session";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5250").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  correlationId?: string;
  details?: unknown;

  constructor(status: number, message: string, code = "ERROR", correlationId?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

type ApiInit = Omit<RequestInit, "body"> & { body?: unknown };

let refreshInFlight: Promise<Session | null> | null = null;

async function parseError(response: Response): Promise<ApiError> {
  let code = "ERROR";
  let message = `Request failed with status ${response.status}.`;
  let correlationId: string | undefined;
  let details: unknown;
  try {
    const payload = await response.json();
    if (payload?.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details ?? payload.error;
    } else if (payload?.title) {
      message = payload.title;
      code = payload.code ?? code;
      details = payload.errors;
    }
    correlationId = payload?.correlationId;
  } catch {
    // Non-JSON responses keep the generic message.
  }
  return new ApiError(response.status, message, code, correlationId, details);
}

async function refreshSession(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  const session = readSession();
  if (!session?.refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!response.ok) return null;
      const next = (await response.json()) as Session;
      writeSession(next);
      return next;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function rawRequest(path: string, init: ApiInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body:
      init.body === undefined
        ? undefined
        : init.body instanceof FormData || typeof init.body === "string"
          ? (init.body as BodyInit)
          : JSON.stringify(init.body),
  });
  return response;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  let session = readSession();
  const perform = async (token?: string) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      body:
        init.body === undefined
          ? undefined
          : init.body instanceof FormData || typeof init.body === "string"
            ? (init.body as BodyInit)
            : JSON.stringify(init.body),
    });
  };

  let response = await perform(session?.accessToken);
  if (response.status === 401 && session?.refreshToken) {
    session = await refreshSession();
    if (session) {
      response = await perform(session.accessToken);
    } else {
      clearSession();
      window.dispatchEvent(new CustomEvent("commerce:unauthorized"));
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(email: string, password: string): Promise<Session> {
  const response = await rawRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as Session;
}

export type RegisterPayload = {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  workspaceName?: string;
  currency?: string;
  seedDemoData?: boolean;
};

export async function register(payload: RegisterPayload): Promise<Session> {
  const response = await rawRequest("/api/v1/auth/register", {
    method: "POST",
    body: payload,
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as Session;
}

export async function switchWorkspace(workspaceId: string): Promise<Session> {
  const response = await api<Session>("/api/v1/auth/switch-workspace", {
    method: "POST",
    body: { workspaceId },
  });
  writeSession(response);
  return response;
}

export async function download(path: string, filename: string): Promise<void> {
  let session = readSession();
  const perform = (token?: string) =>
    fetch(`${API_URL}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : undefined });
  let response = await perform(session?.accessToken);
  if (response.status === 401 && session?.refreshToken) {
    session = await refreshSession();
    if (session) response = await perform(session.accessToken);
  }
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export type Paged<T> = { items: T[]; page: number; pageSize: number; totalCount: number; totalPages: number };

export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

/** The answer to a sign-in code from the host platform (Get Assist): a session, or "link your account once". */
export type HostSignIn = {
  session: Session | null;
  returnPath: string;
  linkRequired: boolean;
  hostName: string | null;
  displayName: string | null;
  workspaceName: string | null;
  /** The host's sign-in address for this workspace, remembered for "Continue with Chithii". */
  hostSignInUrl?: string | null;
};

/** Presents a host sign-in code. A sign-in code is spent; a link code is only described. */
export async function redeemHostCode(code: string): Promise<HostSignIn> {
  const response = await rawRequest("/api/v1/auth/sso/redeem", { method: "POST", body: { code } });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as HostSignIn;
}

/** Links the host person to the Commerce account whose access token is given (just signed in with a password). */
export async function linkHostCode(code: string, accessToken: string): Promise<HostSignIn> {
  const response = await rawRequest("/api/v1/auth/sso/link", {
    method: "POST",
    body: { code },
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as HostSignIn;
}
