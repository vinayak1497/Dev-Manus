import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PROJECTS_HREF } from "@/lib/site";

/** Internal paths only — never redirect to external URLs from ?next=. */
function sanitizeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return PROJECTS_HREF;
}

/**
 * Handles Supabase email-link clicks (magic link / confirm-signup).
 * Supports both PKCE (`?code=`) and token-hash (`?token_hash=&type=`) links,
 * then sends the user to `?next=` (default /projects).
 * Failures fall back to /login, where the user can request a fresh code.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = sanitizeNext(params.get("next"));
  const success = NextResponse.redirect(new URL(next, request.url));
  const failure = NextResponse.redirect(new URL("/login", request.url));

  try {
    const supabase = await createClient();

    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return error ? failure : success;
    }

    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      return error ? failure : success;
    }

    return failure;
  } catch {
    return failure;
  }
}
