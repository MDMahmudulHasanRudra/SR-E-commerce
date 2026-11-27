"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readSession } from "@/lib/session";
import { Icon } from "@/components/icons";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(readSession() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-lime">
          <Icon name="logo" size={24} />
        </span>
        <span className="text-xs text-muted">Opening your workspace…</span>
      </div>
    </div>
  );
}
