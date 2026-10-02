import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client (Server Components / Route Handlers /
 * Server Actions). Reads session from cookies and refreshes via
 * `middleware.ts` (see lib/supabase/middleware.ts).
 *
 * Uses public anon key only. Service-role usage stays in
 * server-only code paths with explicit justification.
 *
 * Typed against the GENERATED `Database` type (`npm run db:types`), so a
 * column that does not exist in Postgres is a compile error rather than a
 * runtime surprise. Never hand-edit database.types.ts.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.example).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — middleware refreshes the session.
        }
      },
    },
  });
}
