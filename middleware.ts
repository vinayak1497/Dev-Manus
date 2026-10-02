import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only run the session-refresh + auth gate where a server-verified session
  // is actually required. `/projects` is the sole server-authenticated area
  // today (its page reads the verified user id from the header this
  // middleware sets). The public marketing pages, auth screens, and every
  // static asset are intentionally excluded so they render fast and cacheable
  // without a Supabase auth round trip on each reload. Add future protected
  // prefixes (e.g. "/dashboard/:path*") here.
  matcher: ["/projects/:path*"],
};
