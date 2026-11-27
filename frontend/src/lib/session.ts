export type AuthUser = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  email: string;
  fullName: string;
  companyName: string;
  workspaceName: string;
  role: string;
  currencyCode: string;
  timeZone: string;
  permissions: string[];
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: AuthUser;
};

const STORAGE_KEY = "commerce.session";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.accessToken || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("commerce:session", { detail: session }));
}

export function clearSession() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("commerce:session", { detail: null }));
}
