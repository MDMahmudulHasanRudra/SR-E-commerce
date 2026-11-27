"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, linkHostCode, login, redeemHostCode, type HostSignIn } from "@/lib/api";
import { writeSession } from "@/lib/session";
import { hostLabel, rememberHostSignIn } from "@/lib/hostSignIn";
import { Icon } from "@/components/icons";
import { Button, Spinner } from "@/components/ui";

/** Commerce's own refusal as it said it; a network failure in words a person can act on. */
function describe(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof TypeError) return "Commerce could not be reached. Check your connection and open it again.";
  return fallback;
}

type State =
  | { kind: "working" }
  | { kind: "link"; code: string; info: HostSignIn }
  | { kind: "error"; message: string };

/**
 * Where the host platform (Get Assist) sends the browser with a single-use code in the address fragment.
 * The code is read once and removed from the address before anything else happens. A sign-in code becomes
 * a normal Commerce session; a link code asks the person to sign in to Commerce once, which links their host
 * account to this Commerce account for this workspace only.
 */
export default function HostLaunchPage() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: "working" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    window.history.replaceState(null, "", "/sso/launch");
    if (!code) {
      setState({ kind: "error", message: "This sign-in link is incomplete. Open Commerce again from Chithii." });
      return;
    }
    redeemHostCode(code)
      .then((info) => {
        rememberHostSignIn(info.hostSignInUrl, info.hostName);
        if (info.session) {
          writeSession(info.session);
          router.replace(info.returnPath || "/dashboard");
        } else if (info.linkRequired) {
          setState({ kind: "link", code, info });
        } else {
          setState({ kind: "error", message: "Commerce could not sign you in. Open it again from Chithii." });
        }
      })
      .catch((cause: unknown) => setState({ kind: "error", message: describe(cause, "Commerce could not sign you in.") }));
  }, [router]);

  async function onLink(event: FormEvent) {
    event.preventDefault();
    if (state.kind !== "link") return;
    setBusy(true);
    setFormError(null);
    try {
      // The password sign-in is only the proof; the session kept is the one for the connected workspace.
      const proof = await login(email.trim(), password);
      const linked = await linkHostCode(state.code, proof.accessToken);
      if (!linked.session) throw new Error("Commerce could not finish linking your account.");
      rememberHostSignIn(linked.hostSignInUrl, linked.hostName);
      writeSession(linked.session);
      router.replace(linked.returnPath || "/dashboard");
    } catch (cause) {
      setFormError(describe(cause, "Commerce could not link your account."));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar text-lime">
            <Icon name="logo" size={19} />
          </span>
          <p className="text-[13px] font-semibold leading-tight">Commerce</p>
        </div>

        {state.kind === "working" ? (
          <div className="flex items-center gap-2.5 text-sm text-muted" role="status">
            <Spinner size={15} /> Signing you in…
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-relaxed text-rose-700">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </div>
            <Link href="/login" className="text-[12.5px] font-medium text-ink underline underline-offset-2">
              Sign in with your Commerce account instead
            </Link>
          </div>
        ) : null}

        {state.kind === "link" ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">One-time step</p>
            <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
              Link your {hostLabel(state.info.hostName)} account
            </h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              {state.info.displayName ? <>You are signed in to {hostLabel(state.info.hostName)} as {state.info.displayName}. </> : null}
              Sign in to Commerce once to link the two. After this, {state.info.workspaceName ?? "your store"} opens from{" "}
              {hostLabel(state.info.hostName)} without a password. Your Commerce role still decides what you can do.
            </p>

            <form onSubmit={onLink} className="mt-6 space-y-4">
              {formError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-700">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-ink-soft">
                  Commerce email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-ink-soft">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                {busy ? "Linking…" : "Sign in and link"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
