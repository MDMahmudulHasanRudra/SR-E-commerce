"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import { writeSession } from "@/lib/session";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Select, Switch } from "@/components/ui";

const currencies = ["USD", "EUR", "GBP", "BDT", "CAD", "AUD", "SGD", "INR"];

export default function RegisterPage() {
  const router = useRouter();
  const { session, ready, refresh } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Main Store");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [seedDemoData, setSeedDemoData] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && session) router.replace("/dashboard");
  }, [ready, session, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (companyName.trim().length < 2) {
      setError("Company name must be at least 2 characters.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Your full name is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const next = await register({
        companyName: companyName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        workspaceName: workspaceName.trim() || "Main Store",
        currency,
        seedDemoData,
      });
      writeSession(next);
      refresh();
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_1.15fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar px-10 py-9 text-[#e9ebe2] lg:flex xl:px-14">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-70" />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "radial-gradient(circle, #d8f36b 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-lime text-[#171914]">
            <Icon name="logo" size={21} />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight text-white">Commerce ERP</p>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.16em] text-[#8d9284]">Standalone workspace</p>
          </div>
        </div>

        <div className="relative max-w-[460px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#c3c7b8]">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            Isolated tenant provisioning
          </span>
          <h1 className="mt-5 text-[38px] font-semibold leading-[1.08] tracking-[-0.03em] text-white xl:text-[44px]">
            Launch a dedicated store workspace in seconds.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-[#a6ab9d]">
            Registration creates an isolated tenant, primary workspace, default warehouse, tax rate, and owner role —
            ready for standalone operations or later Get Assist connection.
          </p>
          <ul className="mt-7 space-y-2.5">
            {[
              ["shield", "Strict tenant & workspace data isolation"],
              ["warehouse", "Default warehouse & tax rate pre-configured"],
              ["plug", "Optional demo catalog & orders for instant evaluation"],
            ].map(([icon, label]) => (
              <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-[#c8ccbe]">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-lime">
                  <Icon name={icon as "shield" | "warehouse" | "plug"} size={13} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[10px] uppercase tracking-[0.14em] text-[#646a5c]">
          Commerce v1 · Tenant registration
        </p>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar text-lime">
              <Icon name="logo" size={19} />
            </span>
            <p className="text-[13px] font-semibold">Commerce ERP</p>
          </div>
          <Link href="/login" className="text-xs font-medium text-brand hover:underline">
            Sign in
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10">
          <div className="w-full max-w-[440px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Create tenant</p>
            <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em]">
              Register your business
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Set up your company and owner account. You can invite team members and connect Get Assist later.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-700">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company name" required>
                  <Input
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Acme Retail Ltd"
                    required
                  />
                </Field>
                <Field label="Workspace / store name" required>
                  <Input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="Main Store"
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
                <Field label="Your full name" required>
                  <Input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Alex Morgan"
                    required
                  />
                </Field>
                <Field label="Currency">
                  <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    {currencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Owner email" required>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="owner@company.com"
                  required
                />
              </Field>

              <Field label="Password" required hint="Minimum 8 characters.">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="pr-14"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-[10.5px] font-medium text-muted transition-colors hover:text-ink"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>

              <div className="rounded-xl border border-line bg-[#faf9f5] p-3.5">
                <Switch
                  checked={seedDemoData}
                  onChange={setSeedDemoData}
                  label="Seed sample catalog, customers & orders"
                  description="Pre-populate your new workspace with realistic sample data to explore right away."
                />
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
                {loading ? "Creating workspace…" : "Create workspace"}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted">
              Already have a workspace?{" "}
              <Link href="/login" className="font-medium text-brand hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
