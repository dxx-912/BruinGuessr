import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const supabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL");
export const supabasePublicKey = () => env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

let admin: SupabaseClient | undefined;

/**
 * Supabase client with the secret key. It bypasses row level security, so it is
 * the only thing that can read game tables, call game functions, or fetch a
 * photo from Storage. Server only: this module cannot be imported by browser code.
 */
export function adminClient(): SupabaseClient {
  admin ??= createClient(supabaseUrl(), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Supabase client acting as the signed-in visitor, with the session kept in
 * cookies. Used only for auth (who is this, sign in, sign out); game data never
 * goes through it.
 */
export async function sessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. The proxy (src/proxy.ts) keeps
          // the session fresh, so there is nothing to save here.
        }
      },
    },
  });
}
