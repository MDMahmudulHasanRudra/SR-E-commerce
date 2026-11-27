"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/icons";
import { Button, cn } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { parseHostSignIn, readHostSignInRaw } from "@/lib/hostSignIn";

const noSubscribe = () => () => {};

const demoEmail = "admin@commerce.local";
const demoPassword = "Admin123!";
const spark = [0, 0, 13.5, 0, 0, 17.9, 0, 7.4, 0, 0, 5.7, 0, 10.9, 9.3];

export default function LoginPage() {
  const router = useRouter();
  const { session, ready, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const host = parseHostSignIn(useSyncExternalStore(noSubscribe, readHostSignInRaw, () => null));

  useEffect(() => {
    if (ready && session) router.replace("/dashboard");
  }, [ready, session, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.06fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar px-10 py-9 text-[#e9ebe2] lg:flex xl:px-14">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-70" />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "radial-gradient(circle, #d8f36b 0%, transparent 70%)" }}
        />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "radial-gradient(circle, #7fb494 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-lime text-[#171914]">
            <Icon name="logo" size={21} />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight text-white">Northwind Commerce</p>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.16em] text-[#8d9284]">Operations workspace</p>
          </div>
        </div>

        <div className="relative max-w-[520px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#c3c7b8]">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            Multi-tenant commerce OS
          </span>
          <h1 className="mt-5 text-[42px] font-semibold leading-[1.06] tracking-[-0.035em] text-white xl:text-[48px]">
            Every order, every shelf,
            <br />
            <span className="text-[#b9c7a8]">one calm workspace.</span>
          </h1>
          <p className="mt-4 max-w-[440px] text-[13.5px] leading-relaxed text-[#a6ab9d]">
            Run catalog, inventory, fulfilment, purchasing and finance from a single tenant-scoped
            system — with an explicit, versioned boundary for host-platform integrations.
          </p>

          <ul className="mt-7 space-y-2.5">
            {[
              ["shield", "Workspace isolation enforced on every request"],
              ["layers", "Catalog, orders, stock and money in one model"],
              ["plug", "HMAC provisioning boundary for Get Assist"],
            ].map(([icon, label]) => (
              <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-[#c8ccbe]">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-lime">
                  <Icon name={icon as "shield" | "layers" | "plug"} size={13} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="max-w-[440px] rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-[#8d9284]">Revenue · last 30 days</p>
                <p className="num mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-white">
                  $4,479.90
                </p>
                <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#2a3423] px-1.5 py-0.5 text-[10.5px] font-medium text-[#c5e08e]">
                  <Icon name="arrowUp" size={11} /> 11.4% vs previous 30
                </p>
              </div>
              <Sparkline data={spark} color="#d8f36b" width={140} height={52} fill />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3 text-[10.5px] text-[#9ea395]">
              <div>
                <p className="num text-[14px] font-medium text-white">10</p>
                <p>Orders</p>
              </div>
              <div>
                <p className="num text-[14px] font-medium text-white">393</p>
                <p>Units on hand</p>
              </div>
              <div>
                <p className="num text-[14px] font-medium text-[#e8c98a]">2</p>
                <p>Low stock</p>
              </div>
            </div>
          </div>
          <p className="mt-5 text-[10px] uppercase tracking-[0.14em] text-[#646a5c]">
            Commerce v1 · ASP.NET Core 10 · Next.js 16
          </p>
        </div>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar text-lime">
              <Icon name="logo" size={19} />
            </span>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Northwind Commerce</p>
              <p className="text-[10px] text-muted">Operations workspace</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10">
          <div className="w-full max-w-[360px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Welcome back</p>
            <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em]">Sign in to your workspace</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Use your workspace account. Access is checked against tenant membership on every request.
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-700">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-ink-soft">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-[#a6a99e] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-ink-soft">
                    Password
                  </label>
                  <span className="text-[10.5px] text-muted">Contact your admin to reset</span>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-lg border border-line bg-surface px-3 pr-14 text-sm text-ink placeholder:text-[#a6a99e] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-[10.5px] font-medium text-muted transition-colors hover:text-ink"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            {host ? (
              <div className="mt-4">
                <div className="mb-4 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <a
                  href={host.url}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-sm font-medium text-ink transition-colors hover:bg-[#f4f3ee]"
                >
                  Continue with {host.name}
                </a>
                <p className="mt-1.5 text-center text-[10.5px] text-muted">Uses your {host.name} login. No Commerce password needed.</p>
              </div>
            ) : null}

            <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-[#faf9f5] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-ink-soft">Demo workspace</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                    {demoEmail} · {demoPassword}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword(demoPassword);
                    setError(null);
                  }}
                >
                  Fill
                </Button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[#989c90]">
                Seeded in Development only. Create your own tenant through the registration endpoint for
                production use.
              </p>
            </div>

            <div className="mt-8 flex items-center gap-2 text-[10.5px] text-[#9a9e92]">
              <Icon name="shield" size={12} />
              <span>Passwords hashed with PBKDF2 · rotating refresh tokens</span>
            </div>
          </div>
        </div>

        <div className={cn("border-t border-line px-5 py-4 text-center text-[10px] text-[#9a9e92] sm:px-10")}>
          Commerce ERP · API contract v1 · Tenant and workspace scoped
        </div>
      </section>
    </div>
  );
}
