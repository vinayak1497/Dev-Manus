"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Signed-in identity in the app header.
 *
 * Reads the client session that AuthProvider already holds, so the server
 * never has to fetch the user just to render an email (display only — it
 * grants no access; RLS and middleware own authorisation).
 */
export function UserGreeting({ fallback }: { fallback?: string | null }) {
  const { user } = useAuth();

  const label =
    (typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "") || user?.email || fallback || null;

  if (!label) return null;

  return (
    <span className="hidden max-w-[240px] truncate text-[13px] text-ink-secondary sm:inline">
      {label}
    </span>
  );
}
