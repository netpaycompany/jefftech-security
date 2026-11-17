"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorSmartphone, ShieldCheck, XCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type ExtensionSession = {
  id: string;
  created_at: string;
  last_used_at: string;
  refresh_expires_at: string;
};

function isSession(value: unknown): value is ExtensionSession {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.created_at === "string"
    && typeof row.last_used_at === "string"
    && typeof row.refresh_expires_at === "string";
}

export function ExtensionSessions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ExtensionSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState("");
  const [error, setError] = useState("");

  const loadSessions = useCallback(async () => {
    const client = createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw new Error(`Unable to verify your Jefftech account: ${authError.message}`);
    if (!user) {
      router.replace("/login?next=/settings");
      return;
    }

    const { data, error: queryError } = await client.rpc("list_my_extension_sessions");
    if (queryError) throw new Error(`Unable to load connected extensions: ${queryError.message}`);
    if (!Array.isArray(data) || !data.every(isSession)) {
      throw new Error("The extension session list has an invalid format.");
    }
    setSessions(data);
  }, [router]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadSessions().catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load connected extensions.");
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadSessions]);

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this extension session? The extension will be disconnected immediately.")) return;
    setRevokingId(id);
    setError("");
    try {
      const { error: revokeError } = await createClient().rpc("revoke_my_extension_session", { p_session_id: id });
      if (revokeError) throw new Error(`Unable to revoke this extension session: ${revokeError.message}`);
      setSessions((current) => current.filter((session) => session.id !== id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to revoke this extension session.");
    } finally {
      setRevokingId("");
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 xl:col-span-2">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
          <MonitorSmartphone className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Browser extensions</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Connected extension sessions</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Revocation blocks future server access. If the extension is already unlocked, its in-memory data clears when it next checks the session or is locked.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {isLoading ? (
        <p className="mt-5 text-sm text-slate-400">Loading connected extensions…</p>
      ) : sessions.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" /> Jefftech Security browser extension
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Connected {new Date(session.created_at).toLocaleString()} · Last used {new Date(session.last_used_at).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">Session expires {new Date(session.refresh_expires_at).toLocaleDateString()}</p>
              </div>
              <button
                type="button"
                disabled={Boolean(revokingId)}
                onClick={() => void revoke(session.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> {revokingId === session.id ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
          No active browser extension sessions.
        </p>
      )}
    </section>
  );
}
