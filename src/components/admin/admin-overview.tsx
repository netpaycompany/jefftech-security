"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";

type Overview = {
  registeredUsers: number;
  profilesUpdatedLast30Days: number;
  verifiedUsers: number;
  vaults: number;
  securityEventsLast24Hours: { eventType: string; severity: string; createdAt: string }[];
  subscriptionCounts: Record<string, number>;
  database: string;
};

export function AdminOverview() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          router.replace("/admin/login");
          throw new Error(response.status === 403 ? "Administrator role required." : "Sign in to continue.");
        }
        if (!response.ok) throw new Error("Operational metrics are unavailable.");
        return response.json() as Promise<Overview>;
      })
      .then((overview) => { if (active) setData(overview); })
      .catch((caughtError: unknown) => { if (active) setError(caughtError instanceof Error ? caughtError.message : "Could not load admin metrics."); });
    return () => { active = false; };
  }, [router]);

  const signOut = async () => {
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setError(`Sign-out failed: ${signOutError.message}`);
      return;
    }
    router.replace("/admin/login");
  };

  return (
    <AppShell title="Administrator" activePath="/admin" adminMode>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operational metadata only</p><p className="mt-2 text-sm text-slate-300">Administrators cannot access master passwords, decrypted vault records, or documents.</p></div>
        <button type="button" onClick={() => void signOut()} className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-200">Sign out</button>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">{error}</p>}
      {!data && !error && <p role="status" className="mt-6 text-sm text-slate-400">Loading operational metrics…</p>}
      {data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Registered users" value={data.registeredUsers} />
            <Metric label="Profiles updated in 30 days" value={data.profilesUpdatedLast30Days} />
            <Metric label="Verified email profiles" value={data.verifiedUsers} />
            <Metric label="Vaults (metadata count)" value={data.vaults} />
            <Metric label="Database health" value={data.database} />
          </div>
          <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">Subscriptions</h2>
            <p className="mt-1 text-sm text-slate-400">Plan status is operational metadata; billing integration is not configured.</p>
            <ul className="mt-4 flex flex-wrap gap-3">{Object.entries(data.subscriptionCounts).map(([key, count]) => <li key={key} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">{key}: {count}</li>)}</ul>
          </section>
          <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">Security events · last 24 hours</h2>
            <ul className="mt-4 space-y-2">{data.securityEventsLast24Hours.map((event, index) => <li key={`${event.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"><span className="text-slate-200">{event.eventType} · {event.severity}</span><time className="text-slate-500">{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>
            {data.securityEventsLast24Hours.length === 0 && <p className="mt-3 text-sm text-slate-400">No security event records.</p>}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p></div>;
}
