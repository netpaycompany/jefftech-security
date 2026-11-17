import { createBrowserClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase Auth is not configured. Add the project URL and publishable key to .env.local.");
  }

  browserClient ??= createBrowserClient(supabaseUrl, supabasePublishableKey);
  return browserClient;
}
