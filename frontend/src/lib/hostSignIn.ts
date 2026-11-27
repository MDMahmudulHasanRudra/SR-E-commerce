/**
 * "Continue with Chithii" on Commerce's own sign-in page. Commerce cannot know, before anyone signs in, which host
 * workspace a visitor belongs to; the browser can. Each time a person arrives from the host platform, the host's
 * sign-in address for THEIR workspace (set by the host's signed provisioning) is remembered in this browser, and
 * the sign-in page offers it. A convenience only: the address leads to the host, which signs the person in and
 * sends them back through the ordinary single-use launch; nothing here grants access.
 */

const KEY = "commerce.hostSignIn";

export type RememberedHost = { url: string; name: string };

/** "Get Assist" is the host platform's technical id in this contract; the product is called Chithii. */
export function hostLabel(name: string | null | undefined): string {
  return !name || name === "Get Assist" ? "Chithii" : name;
}

function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password) return null;
    return url.protocol === "https:" || (url.protocol === "http:" && loopback) ? url.href : null;
  } catch {
    return null;
  }
}

export function rememberHostSignIn(url: string | null | undefined, name: string | null | undefined): void {
  const safe = safeUrl(url);
  if (!safe) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ url: safe, name: hostLabel(name) }));
  } catch {
    /* storage refused: the button simply does not appear */
  }
}

/** The raw stored text, for useSyncExternalStore (a string compares by value, so no re-render loop). */
export function readHostSignInRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseHostSignIn(raw: string | null): RememberedHost | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { url?: unknown; name?: unknown };
    const url = safeUrl(value.url);
    return url ? { url, name: hostLabel(typeof value.name === "string" ? value.name.slice(0, 40) : null) } : null;
  } catch {
    return null;
  }
}
