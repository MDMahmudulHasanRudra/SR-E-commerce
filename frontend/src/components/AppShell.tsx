"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { CommandPalette } from "./CommandPalette";
import { Icon, type IconName } from "./icons";
import { Avatar, Button, Kbd, Spinner, cn } from "./ui";
import { api } from "@/lib/api";
import { useShellTheme } from "@/lib/theme";
import type { WorkspaceOption } from "@/lib/types";

type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { label?: string; items: NavItem[] };

const navigation: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
  {
    label: "Catalog",
    items: [
      { href: "/products", label: "Products", icon: "box" },
      { href: "/categories", label: "Categories", icon: "folder" },
      { href: "/brands", label: "Brands", icon: "award" },
      { href: "/inventory", label: "Inventory", icon: "warehouse" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/customers", label: "Customers", icon: "users" },
      { href: "/offers", label: "Offers", icon: "tag" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/purchasing", label: "Purchasing", icon: "truck" },
      { href: "/finance", label: "Finance", icon: "wallet" },
      { href: "/reports", label: "Reports", icon: "chart" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/integration", label: "Integration", icon: "plug" },
    ],
  },
];

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/categories": "Categories",
  "/brands": "Brands",
  "/inventory": "Inventory",
  "/orders": "Orders",
  "/customers": "Customers",
  "/offers": "Offers",
  "/purchasing": "Purchasing",
  "/finance": "Finance",
  "/reports": "Reports",
  "/settings": "Settings",
  "/integration": "Integration",
};

function sectionFor(pathname: string): string {
  if (
    pathname.startsWith("/products") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/brands") ||
    pathname.startsWith("/inventory")
  )
    return "Catalog";
  if (pathname.startsWith("/orders") || pathname.startsWith("/customers") || pathname.startsWith("/offers"))
    return "Sales";
  if (
    pathname.startsWith("/purchasing") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/reports")
  )
    return "Operations";
  if (pathname === "/dashboard") return "Overview";
  return "Workspace";
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready, signOut, switchWorkspace } = useAuth();
  const { config, isEmbedded, backUrl, hostName } = useShellTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  useEffect(() => {
    setMobileOpen(false);
    setCreateOpen(false);
    setWorkspaceOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    const onClick = (event: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(event.target as Node)) setCreateOpen(false);
      if (workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) setWorkspaceOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    if (!workspaceOpen || workspaces) return;
    api<WorkspaceOption[]>("/api/v1/auth/workspaces")
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, [workspaceOpen, workspaces]);

  if (!ready) return <Splash />;
  if (!session) return <Splash />;

  const pageTitle = titles[Object.keys(titles).find((key) => isActive(pathname, key)) ?? ""] ?? "Commerce";
  const section = sectionFor(pathname);
  const brandHeading = config.brandTitle.trim() || session.user.companyName;

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-[#e9ebe2]">
      <div className="relative px-4 pb-4 pt-5" ref={workspaceRef}>
        {isEmbedded && backUrl && (
          <a
            href={backUrl}
            target="_top"
            className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-[#e9ebe2] transition-colors hover:bg-white/[0.12]"
          >
            <Icon name="chevronLeft" size={13} className="text-lime" />
            <span className="truncate">Back to {hostName}</span>
          </a>
        )}
        <button
          type="button"
          onClick={() => setWorkspaceOpen((value) => !value)}
          className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-lime text-[#171914]">
            <Icon name="logo" size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-white">
              {brandHeading}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[#9ea395]">
              <span className="h-1 w-1 rounded-full bg-lime" />
              <span className="truncate">{session.user.workspaceName}</span>
            </span>
          </span>
          <Icon name="chevronDown" size={14} className="shrink-0 text-[#8d9284]" />
        </button>

        {workspaceOpen && (
          <div className="absolute left-4 right-4 top-[64px] z-40 overflow-hidden rounded-xl border border-white/10 bg-[#1c2117] p-1.5 shadow-2xl">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#8d9284]">
              Workspaces
            </p>
            {workspaceBusy && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-[#aeb2a4]">
                <Spinner size={13} /> Switching workspace…
              </div>
            )}
            {!workspaceBusy &&
              (workspaces ?? []).map((workspace) => {
                const wsId = workspace.workspaceId ?? workspace.id ?? "";
                const wsCompany = workspace.tenantName ?? workspace.companyName ?? "";
                return (
                  <button
                    key={wsId}
                    type="button"
                    disabled={!wsId || wsId === session.user.workspaceId}
                    onClick={async () => {
                      if (!wsId) return;
                      setWorkspaceBusy(true);
                      try {
                        await switchWorkspace(wsId);
                      } finally {
                        setWorkspaceBusy(false);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                      wsId === session.user.workspaceId
                        ? "bg-white/[0.06] text-white"
                        : "text-[#c7cabf] hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{workspace.name}</span>
                      <span className="block truncate text-[10px] text-[#8d9284]">
                        {wsCompany} · {workspace.currencyCode}
                      </span>
                    </span>
                    {wsId === session.user.workspaceId && <Icon name="check" size={13} className="text-lime" />}
                  </button>
                );
              })}
            {!workspaceBusy && workspaces?.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-[#8d9284]">No workspaces available.</p>
            )}
          </div>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {navigation.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={groupIndex === 0 ? "" : "mt-5"}>
            {group.label && (
              <p className="mb-1.5 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-[#767c6d]">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                        active
                          ? "bg-[#252b1f] text-white"
                          : "text-[#aeb2a4] hover:bg-white/[0.045] hover:text-white",
                      )}
                    >
                      <Icon
                        name={item.icon}
                        size={16}
                        className={cn("shrink-0", active ? "text-lime" : "text-[#878d7d] group-hover:text-[#c6cabc]")}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.href === "/integration" && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#5e6555]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10.5px] text-[#a4a899]">API contract v1</span>
          <span className="ml-auto text-[9.5px] uppercase tracking-wider text-[#767c6d]">Isolated</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5">
          <Avatar name={session.user.fullName} size={30} className="bg-[#2c3325] text-[#dfe3d5]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium text-white">{session.user.fullName}</p>
            <p className="truncate text-[10px] text-[#8d9284]">{session.user.role}</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#8d9284] transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#0e100c]/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <div className="animate-slide-in absolute inset-y-0 left-0 w-[270px] shadow-2xl">{sidebar}</div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-[248px] print:pl-0">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-[60px] max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft lg:hidden"
            >
              <Icon name="menu" size={17} />
            </button>

            <div className="hidden min-w-0 items-center gap-2 text-[12px] sm:flex">
              <span className="text-muted">{section}</span>
              <Icon name="chevronRight" size={12} className="text-[#b3b6aa]" />
              <span className="truncate font-medium text-ink">{pageTitle}</span>
              {isEmbedded && (
                <span className="ml-1 rounded-full border border-[#cfe2d6] bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                  Integrated
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="relative ml-auto hidden h-9 w-full max-w-[290px] items-center rounded-lg border border-line bg-surface pl-9 pr-14 text-left text-xs text-[#a6a99e] transition-colors hover:border-line-strong md:flex"
            >
              <Icon
                name="search"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#95998e]"
              />
              <span className="truncate">Search products, orders, customers…</span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <Kbd>⌘K</Kbd>
              </span>
            </button>

            <div className="ml-auto flex items-center gap-1.5 md:ml-2">
              {isEmbedded && backUrl && (
                <a
                  href={backUrl}
                  target="_top"
                  className="hidden items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-[#f3f1ea] sm:inline-flex"
                >
                  <Icon name="chevronLeft" size={13} /> Back to {hostName}
                </a>
              )}
              <Link
                href="/inventory?lowStock=1"
                aria-label="Inventory alerts"
                title="Inventory alerts"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[#ecebe4] hover:text-ink"
              >
                <Icon name="alert" size={17} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-canvas" />
              </Link>

              <div className="relative" ref={createRef}>
                <Button
                  variant="primary"
                  size="sm"
                  icon="plus"
                  className="h-9"
                  onClick={() => setCreateOpen((value) => !value)}
                >
                  <span className="hidden sm:inline">New</span>
                </Button>
                {createOpen && (
                  <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                    {[
                      { label: "New order", href: "/orders?new=1", icon: "orders" as IconName },
                      { label: "New product", href: "/products/new", icon: "box" as IconName },
                      { label: "New customer", href: "/customers?new=1", icon: "users" as IconName },
                      { label: "New category", href: "/categories?new=1", icon: "folder" as IconName },
                      { label: "New purchase order", href: "/purchasing?new=1", icon: "truck" as IconName },
                      { label: "Record payment", href: "/finance?new=payment", icon: "wallet" as IconName },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-ink-soft transition-colors hover:bg-[#f3f1ea]"
                      >
                        <Icon name={item.icon} size={14} className="text-muted" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href="/settings"
                aria-label="Account settings"
                className="ml-1 flex items-center gap-2 rounded-full border border-line bg-surface p-0.5 pr-2 transition-colors hover:bg-[#f3f1ea]"
              >
                <Avatar name={session.user.fullName} size={28} />
                <span className="hidden text-[11px] font-medium text-ink-soft sm:block">
                  {session.user.fullName.split(" ")[0]}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
          {children}
        </main>

        <footer className="no-print mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[10.5px] text-[#989c90] sm:px-6 lg:px-8">
          <span>
            {session.user.companyName} · {session.user.workspaceName}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="shield" size={11} /> Tenant-scoped workspace · contract v1
          </span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-lime">
          <Icon name="logo" size={24} />
        </span>
        <Spinner size={16} className="text-brand" />
      </div>
    </div>
  );
}
