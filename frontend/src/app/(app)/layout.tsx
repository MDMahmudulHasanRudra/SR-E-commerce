import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export const instant = false;

function ShellFallback() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-[248px] lg:bg-sidebar" />
      <div className="flex min-h-screen flex-col lg:pl-[248px]">
        <div className="h-[60px] border-b border-line bg-canvas" />
        <div className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="space-y-4">
            <div className="skeleton h-8 w-56 rounded-md" />
            <div className="skeleton h-24 w-full rounded-xl" />
            <div className="skeleton h-[320px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="skeleton h-8 w-56 rounded-md" />
              <div className="skeleton h-24 w-full rounded-xl" />
              <div className="skeleton h-[320px] w-full rounded-xl" />
            </div>
          }
        >
          {children}
        </Suspense>
      </AppShell>
    </Suspense>
  );
}
