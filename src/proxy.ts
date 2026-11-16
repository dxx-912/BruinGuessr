import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the sign-in session fresh. Session tokens last an hour; when one is
 * close to expiring this swaps it for a new one and writes the new cookies,
 * which page renders cannot do themselves.
 *
 * This is not the security check. Every API route verifies the session itself.
 */
export async function proxy(request: NextRequest) {
  // Visitors who are not signed in have nothing to refresh.
  if (!request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );
  // Reads the session and refreshes it if it is about to expire.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Everything except static files.
  matcher: ["/((?!_next/static|_next/image|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs)$).*)"],
};
