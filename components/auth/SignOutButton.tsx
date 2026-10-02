"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Minimal sign-out control for authenticated screens.
 * Matches the auth shell's secondary button treatment.
 */
export function SignOutButton() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setError(null);
    const { error: signOutError } = await signOut();
    setIsSigningOut(false);
    if (signOutError) {
      setError(signOutError);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        className="rounded border border-border px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-70"
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span className="text-xs text-critical" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
