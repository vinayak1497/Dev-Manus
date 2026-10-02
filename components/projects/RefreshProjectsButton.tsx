"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Re-reads the project list from the server (Supabase via RLS).
 * Deliberately not labelled "Sync Telemetry" — no telemetry pipeline
 * exists yet, and the button must not imply one (RULE.md §9.1/§25).
 */
export function RefreshProjectsButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  // `router.refresh()` inside a transition keeps `isPending` true until the
  // server re-render is committed, so the spinner tracks the real refresh —
  // no separate state or arbitrary timeout (which leaked and could fire
  // setState after unmount) is needed.
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (isPending) return;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      title="Reload your project list from the database"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded border border-border-hairline bg-surface px-3.5 text-[14px] font-medium text-ink shadow-card transition-colors hover:bg-canvas disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4 text-ink-muted", isPending && "animate-spin")}
        aria-hidden="true"
      />
      {isPending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
