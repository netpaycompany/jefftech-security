import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";

export async function requireAdmin() {
  await connection();
  const authClient = await createClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) {
    return { response: Response.json({ error: "Authentication required." }, { status: 401 }) } as const;
  }
  if (user.app_metadata?.role !== "admin") {
    return { response: Response.json({ error: "Administrator access required." }, { status: 403 }) } as const;
  }
  if (!isSupabaseConfigured()) {
    return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) } as const;
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { response: Response.json({ error: "Server-side administrator access is not configured." }, { status: 503 }) } as const;
  }
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return { user, adminClient } as const;
}

export function isAdminError(value: Awaited<ReturnType<typeof requireAdmin>>): value is { response: Response } {
  return "response" in value;
}
