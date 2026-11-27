"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  login as loginRequest,
  switchWorkspace as switchWorkspaceRequest,
} from "@/lib/api";
import { clearSession, readSession, writeSession, type Session } from "@/lib/session";

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);

    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<Session | null>).detail;
      setSession(detail ?? null);
    };
    const onUnauthorized = () => {
      setSession(null);
      if (!window.location.pathname.startsWith("/login")) {
        router.replace("/login");
      }
    };

    window.addEventListener("commerce:session", onSession);
    window.addEventListener("commerce:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("commerce:session", onSession);
      window.removeEventListener("commerce:unauthorized", onUnauthorized);
    };
  }, [router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    writeSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    const current = readSession();
    if (current?.refreshToken) {
      try {
        await api("/api/v1/auth/logout", {
          method: "POST",
          body: { refreshToken: current.refreshToken },
        });
      } catch {
        // The local session is cleared even if the server is unreachable.
      }
    }
    clearSession();
    setSession(null);
    router.replace("/login");
  }, [router]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const next = await switchWorkspaceRequest(workspaceId);
      setSession(next);
      // A hard navigation is deliberate: every page fetches with the new
      // workspace token, and cached client state from the old workspace must
      // be discarded.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    },
    [],
  );

  const refresh = useCallback(() => setSession(readSession()), []);

  const value = useMemo(
    () => ({ session, ready, signIn, signOut, switchWorkspace, refresh }),
    [session, ready, signIn, signOut, switchWorkspace, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
