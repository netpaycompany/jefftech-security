"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ensureCurrentBrowserRegistered } from "@/lib/device-registration";
import { createClient } from "@/lib/supabase/client";

export function DeviceRegistration() {
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const client = createClient();
    const register = () => {
      void ensureCurrentBrowserRegistered().then(() => {
        if (active) setError("");
      }).catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to register this browser.");
      });
    };

    register();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session) window.setTimeout(() => {
        if (active) register();
      }, 0);
      else if (active) setError("");
    });
    const intervalId = window.setInterval(register, 5 * 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, []);

  if (!error) return null;
  return (
    <div role="alert" className="fixed right-4 top-4 z-[70] max-w-sm rounded-xl border border-amber-500/40 bg-slate-950 p-3 text-sm text-amber-100 shadow-xl">
      <p>{error}</p>
      <div className="mt-2 flex gap-3 text-xs">
        <button type="button" onClick={() => {
          setError("");
          void ensureCurrentBrowserRegistered().catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Unable to register this browser."));
        }} className="font-medium text-cyan-200 hover:text-white">Retry</button>
        <Link href="/profile/my-devices" className="text-blue-200 hover:text-white">Manage devices</Link>
      </div>
    </div>
  );
}
