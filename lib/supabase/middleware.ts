import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Request header carrying the *verified* user id from middleware to Server
 * Components, so they don't re-call `auth.getUser()` (~1 network round trip
 * to the auth server on every page load).
 */
export const USER_ID_HEADER = "x-safeguard-user-id";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * Refreshes the Supabase auth session on every request and enforces
 * server-side protection for authenticated areas (currently /projects*).
 * Frontend redirects are UX only - this middleware is the actual gate.
 *
 * Wire into project `middleware.ts`:
 *
 *   import { updateSession } from "@/lib/supabase/middleware";
 *   export async function middleware(request: NextRequest) {
 *     return updateSession(request);
 *   }
 *   export const config = {
 *     matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
 *   };
 */
export async function updateSession(request: NextRequest) {
  // Never trust an inbound header: drop it before deciding anything
  // (RULE.md §11.3 - treat external input as untrusted).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Collect refreshed cookies and apply them once, on the final response.
  // Rebuilding the response mid-flight would silently drop them.
  const pendingCookies: CookieToSet[] = [];

  // Anonymous visitors have no Supabase auth cookie, so there is no session
  // to verify or refresh. Skipping the network round trip to the auth server
  // keeps every unauthenticated page load fast (the common case for first
  // visits and the marketing pages). The Supabase SSR cookie is named
  // `sb-<project-ref>-auth-token` (may be chunked with a `.0`/`.1` suffix).
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  const isProtected = request.nextUrl.pathname.startsWith("/projects");

  if (!hasAuthCookie) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "next",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  // A transient auth-server outage or timeout must never take the whole site
  // down. Treat a failed verification as "no session" — protected routes then
  // fail closed (redirect to login) and public routes still render.
  let user: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  // Server-side gate for authenticated areas (isProtected computed above).
  // Add future protected prefixes (e.g. /dashboard) there - never rely on
  // client-side checks alone for sensitive data.
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  // Hand the verified identity downstream so Server Components don't pay a
  // second auth round trip. RLS still scopes the data - this only avoids
  // verifying the same JWT twice.
  if (user) {
    requestHeaders.set(USER_ID_HEADER, user.id);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );

  return response;
}
