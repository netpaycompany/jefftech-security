"use client";

import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";

type VisitorSession = {
  sessionId: string;
  profileId: string | null;
  name: string | null;
  email: string | null;
  countryCode: string | null;
  lastSeenAt: string;
  pageViews: number;
  durationSeconds: number;
  pages: string[];
};

type CountRow = { date: string; count: number };
type AnalyticsData = {
  totals: { pageViews: number; uniqueSessions: number; activeSessions: number };
  signups: { today: number; last7Days: number; last30Days: number; lastYear: number };
  signupsByDay: CountRow[];
  countries: { countryCode: string; visits: number }[];
  pages: { page: string; visits: number }[];
  visitors: VisitorSession[];
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function countryName(code: string | null) {
  if (!code) return "Unknown";
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadAnalytics = useCallback(async () => {
    const response = await fetch("/api/admin/analytics", { cache: "no-store" });
    const body = await response.json() as AnalyticsData | { error?: string };
    if (!response.ok) {
      throw new Error("error" in body ? body.error ?? "Could not load website analytics." : "Could not load website analytics.");
    }
    setData(body as AnalyticsData);
    setUpdatedAt(new Date());
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadAnalytics().catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Could not load website analytics.");
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadAnalytics]);

  return (
    <AppShell title="Website Analytics" activePath="/admin/analytics" adminMode>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Visitor sessions, page activity, inferred country, and account signups.</p>
            <p className="mt-1 text-xs text-slate-500">Visit detail is retained for 90 days. Country is estimated by Vercel; IP addresses are not stored.</p>
          </div>
          <div className="text-xs text-slate-500">
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · refreshes every 15 seconds` : "Loading live statistics…"}
          </div>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        {!data && !error && <p role="status" className="mt-6 text-sm text-slate-400">Loading website analytics…</p>}
        {data && (
          <>
            <section aria-label="Live website totals" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Active visitors" value={data.totals.activeSessions} hint="Seen in the last two minutes" />
              <Metric label="Visits · 90 days" value={data.totals.pageViews} />
              <Metric label="Visitor sessions · 90 days" value={data.totals.uniqueSessions} />
              <Metric label="Signups today" value={data.signups.today} />
            </section>

            <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold text-white">New account signups</h2>
                <p className="mt-1 text-sm text-slate-400">Profile creation counts from the last day, week, month, and year.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Today" value={data.signups.today} />
                <Metric label="Last 7 days" value={data.signups.last7Days} />
                <Metric label="Last 30 days" value={data.signups.last30Days} />
                <Metric label="Last 12 months" value={data.signups.lastYear} />
              </div>
              <div className="mt-6">
                <h3 className="text-sm font-medium text-slate-200">Daily signups · last 30 days</h3>
                <div className="mt-3 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1" role="img" aria-label="Daily signup count for the last 30 days">
                  {data.signupsByDay.map((day) => {
                    const max = Math.max(1, ...data.signupsByDay.map((entry) => entry.count));
                    const height = day.count === 0 ? 2 : Math.max(4, (day.count / max) * 100);
                    return (
                      <div key={day.date} className="group relative flex h-full items-end" title={`${day.date}: ${day.count} signups`}>
                        <div className="w-full rounded-t bg-blue-500/80 group-hover:bg-blue-300" style={{ height: `${height}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                  <span>{data.signupsByDay[0]?.date}</span><span>{data.signupsByDay.at(-1)?.date}</span>
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-white">Top countries</h2>
                <p className="mt-1 text-sm text-slate-400">Ranked by recorded page visits in the last 90 days.</p>
                <ol className="mt-4 space-y-2">
                  {data.countries.map((country, index) => (
                    <li key={country.countryCode} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm">
                      <span className="text-slate-200">{index + 1}. {countryName(country.countryCode)}</span>
                      <span className="text-slate-400">{country.visits.toLocaleString()} visits</span>
                    </li>
                  ))}
                  {data.countries.length === 0 && <li className="text-sm text-slate-500">No country data is available yet.</li>}
                </ol>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-white">Most visited pages</h2>
                <p className="mt-1 text-sm text-slate-400">Page paths exclude query strings and fragments.</p>
                <ol className="mt-4 space-y-2">
                  {data.pages.map((page, index) => (
                    <li key={page.page} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-slate-200">{index + 1}. {page.page}</span>
                      <span className="shrink-0 text-slate-400">{page.visits.toLocaleString()}</span>
                    </li>
                  ))}
                  {data.pages.length === 0 && <li className="text-sm text-slate-500">No page visits have been recorded yet.</li>}
                </ol>
              </section>
            </div>

            <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Recent visitor sessions</h2>
              <p className="mt-1 text-sm text-slate-400">Includes signed-in accounts and pseudonymous anonymous sessions.</p>
              <div className="mt-4 space-y-3">
                {data.visitors.map((visitor) => (
                  <article key={`${visitor.sessionId}-${visitor.profileId ?? "anonymous"}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {visitor.name || visitor.email || `Anonymous visitor · ${visitor.sessionId.slice(0, 8)}`}
                        </p>
                        {visitor.name && visitor.email && <p className="mt-1 truncate text-xs text-slate-400">{visitor.email}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{countryName(visitor.countryCode)}</span>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{formatDuration(visitor.durationSeconds)}</span>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{visitor.pageViews} pages</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="break-all">{visitor.pages.join(" · ")}</span>
                      <time className="shrink-0">{new Date(visitor.lastSeenAt).toLocaleString()}</time>
                    </div>
                  </article>
                ))}
                {data.visitors.length === 0 && <p className="text-sm text-slate-500">No visits recorded in the last 90 days.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
