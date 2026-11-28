"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseHostSignIn, readHostSignInRaw } from "./hostSignIn";

export type ThemePreset = "northwind" | "slate" | "cobalt" | "host";
export type ShellDensity = "comfortable" | "compact";

export type ShellConfig = {
  theme: ThemePreset;
  density: ShellDensity;
  brandTitle: string;
  embeddedPreview: boolean;
  backToWorkspaceUrl: string;
};

const STORAGE_KEY = "commerce.shellConfig";

const DEFAULT_CONFIG: ShellConfig = {
  theme: "northwind",
  density: "comfortable",
  brandTitle: "",
  embeddedPreview: false,
  backToWorkspaceUrl: "",
};

type ThemeContextValue = {
  config: ShellConfig;
  isEmbedded: boolean;
  backUrl: string | null;
  hostName: string | null;
  updateConfig: (patch: Partial<ShellConfig>) => void;
  resetConfig: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredConfig(): ShellConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ShellConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ShellConfig>(DEFAULT_CONFIG);
  const [urlEmbedded, setUrlEmbedded] = useState(false);
  const [urlReturn, setUrlReturn] = useState<string | null>(null);
  const [hostInfo, setHostInfo] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    setConfig(readStoredConfig());
    const params = new URLSearchParams(window.location.search);
    const embeddedParam = params.get("embedded") === "true" || params.get("mode") === "integrated";
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    if (embeddedParam || inIframe) {
      setUrlEmbedded(true);
      try {
        window.sessionStorage.setItem("commerce.embedded", "1");
      } catch {
        // ignore storage errors
      }
    } else {
      try {
        if (window.sessionStorage.getItem("commerce.embedded") === "1") {
          setUrlEmbedded(true);
        }
      } catch {
        // ignore
      }
    }
    const backParam = params.get("workspaceUrl") || params.get("backUrl");
    if (backParam && /^https?:\/\//i.test(backParam)) {
      setUrlReturn(backParam);
    }
    setHostInfo(parseHostSignIn(readHostSignInRaw()));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = config.theme;
    root.dataset.density = config.density;
  }, [config.theme, config.density]);

  const updateConfig = useCallback((patch: Partial<ShellConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const isEmbedded = urlEmbedded || config.embeddedPreview;
  const backUrl = config.backToWorkspaceUrl.trim() || urlReturn || hostInfo?.url || null;
  const hostName = hostInfo?.name ?? "Host Workspace";

  const value = useMemo(
    () => ({ config, isEmbedded, backUrl, hostName, updateConfig, resetConfig }),
    [config, isEmbedded, backUrl, hostName, updateConfig, resetConfig],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useShellTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useShellTheme must be used inside ThemeProvider.");
  return ctx;
}
