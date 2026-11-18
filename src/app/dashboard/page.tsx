import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Box,
  CreditCard,
  IdCard,
  KeyRound,
  NotebookPen,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Wifi,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

type ActivityRow = {
  id: string;
  item_type: string;
  event_type: string;
  created_at: string;
};

type SecurityEventRow = {
  id: string;
  event_type: string;
  severity: string;
  created_at: string;
};

const itemLabels: Record<string, string> = {
  password: "password",
  note: "secure note",
  identity: "identity",
  card: "payment card",
  bank_account: "bank account",
  recovery_code: "recovery code",
  license: "software license",
  document: "secure document",
};

const activityVerbs: Record<string, string> = {
  created: "Added",
  updated: "Updated",
  deleted: "Deleted",
};

const securityEventLabels: Record<string, string> = {
  device_registered: "A device was registered",
  device_verified: "A device was verified",
  device_revoked: "A device was revoked",
  vault_item_conflict: "A vault item conflict was detected",
  encrypted_backup_created: "An encrypted backup was created",
};

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Overview" activePath="/dashboard">
          <p role="status" className="text-sm text-slate-400">Loading your dashboard...</p>
        </AppShell>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Unable to load dashboard profile: ${error.message}`);
  }
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const [profileResult, vaultResult, devicesResult, securityEventsResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("vaults").select("id,key_version").eq("profile_id", user.id).eq("is_default", true).maybeSingle(),
    supabase.from("devices").select("id", { count: "exact", head: true })
      .eq("profile_id", user.id).eq("trust_level", "verified").is("revoked_at", null),
    supabase.from("security_events").select("id,event_type,severity,created_at")
      .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(5),
  ]);
  if (profileResult.error) {
    throw new Error(`Unable to load dashboard profile: ${profileResult.error.message}`);
  }
  if (vaultResult.error) {
    throw new Error(`Unable to load dashboard vault: ${vaultResult.error.message}`);
  }
  if (devicesResult.error) {
    throw new Error(`Unable to load trusted devices: ${devicesResult.error.message}`);
  }
  if (securityEventsResult.error) {
    throw new Error(`Unable to load security events: ${securityEventsResult.error.message}`);
  }

  const vault = vaultResult.data;
  const [passwordsResult, notesResult, identitiesResult, allItemsResult, activityResult, keyResult] = vault
    ? await Promise.all([
      supabase.from("vault_items").select("id", { count: "exact", head: true })
        .eq("vault_id", vault.id).eq("item_type", "password"),
      supabase.from("vault_items").select("id", { count: "exact", head: true })
        .eq("vault_id", vault.id).eq("item_type", "note"),
      supabase.from("vault_items").select("id", { count: "exact", head: true })
        .eq("vault_id", vault.id).eq("item_type", "identity"),
      supabase.from("vault_items").select("id", { count: "exact", head: true })
        .eq("vault_id", vault.id),
      supabase.from("vault_activity").select("id,item_type,event_type,created_at")
        .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(6),
      supabase.from("vault_keys").select("recovery_ciphertext")
        .eq("vault_id", vault.id).eq("key_version", vault.key_version).maybeSingle(),
    ])
    : [null, null, null, null, null, null];

  for (const [label, result] of [
    ["password counts", passwordsResult],
    ["secure note counts", notesResult],
    ["identity counts", identitiesResult],
    ["vault item counts", allItemsResult],
    ["vault activity", activityResult],
    ["recovery key status", keyResult],
  ] as const) {
    if (result?.error) {
      throw new Error(`Unable to load dashboard ${label}: ${result.error.message}`);
    }
  }

  const fullName = profileResult.data.full_name ?? "";
  const displayName = fullName || user.email || "Your account";
  const initials = displayName.slice(0, 1).toUpperCase();
  const dashboardMetrics = [
    { label: "Saved passwords", value: passwordsResult?.count ?? 0, detail: "Encrypted in your vault", icon: KeyRound, color: "text-cyan-300 bg-cyan-500/15" },
    { label: "Secure notes", value: notesResult?.count ?? 0, detail: "Encrypted in your vault", icon: NotebookPen, color: "text-violet-300 bg-violet-500/15" },
    { label: "Saved identities", value: identitiesResult?.count ?? 0, detail: "Encrypted in your vault", icon: IdCard, color: "text-sky-300 bg-blue-500/20" },
    {
      label: "Other secure records",
      value: Math.max(
        (allItemsResult?.count ?? 0)
        - (passwordsResult?.count ?? 0)
        - (notesResult?.count ?? 0)
        - (identitiesResult?.count ?? 0),
        0,
      ),
      detail: "Cards, accounts, codes, licenses, and documents",
      icon: CreditCard,
      color: "text-teal-300 bg-teal-500/15",
    },
  ];
  const activity = (activityResult?.data ?? []) as ActivityRow[];
  const securityEvents = (securityEventsResult.data ?? []) as SecurityEventRow[];
  const recoveryReady = Boolean(keyResult?.data?.recovery_ciphertext);

  return (
    <AppShell title="Overview" activePath="/dashboard">
      <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/80 via-slate-900 to-slate-950 p-4 shadow-lg shadow-blue-950/20 sm:mb-6 sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600/80 text-xl font-semibold text-white ring-4 ring-blue-500/10 sm:h-14 sm:w-14">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200 sm:text-xs">Your profile</p>
            <h2 className="mt-1 break-words text-base font-semibold text-white sm:text-xl">{displayName}</h2>
            <p className="mt-1 break-all text-xs text-slate-300 sm:text-sm">{user.email}</p>
          </div>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-xl border border-blue-400/50 px-3 py-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-blue-300 hover:bg-blue-500/10 sm:px-4 sm:text-sm"
        >
          <UserRound className="h-4 w-4" />
          Manage Profile
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-4">
        {dashboardMetrics.map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className="min-w-0 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/75 to-slate-950 p-3.5 shadow-md shadow-blue-950/20 sm:p-5">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${color}`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <p className="min-w-0 text-xs font-semibold leading-4 text-slate-100 sm:text-sm">{label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold leading-none text-white sm:mt-4 sm:text-4xl">{value.toLocaleString()}</p>
            <p className="mt-2 text-[10px] leading-4 text-slate-300 sm:text-xs">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:mt-8 xl:grid-cols-[1.2fr_0.8fr] xl:gap-6">
        <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600/70 text-blue-100">
                <Activity className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-200 sm:text-xs">Recent activity</p>
                <h2 className="mt-1 text-base font-semibold text-white sm:text-xl">Recent vault changes</h2>
              </div>
            </div>
            <Link href="/security" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-blue-400/60 px-2.5 py-2 text-[10px] font-medium text-slate-100 sm:gap-2 sm:px-3 sm:text-sm">
              Security Center <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-400/30 bg-slate-950/45 p-3 sm:p-4">
                <div>
                  <p className="font-medium text-white">
                    {activityVerbs[item.event_type] ?? "Changed"} {itemLabels[item.item_type] ?? "vault item"}
                  </p>
                  <p className="text-xs text-slate-500">Item details remain encrypted</p>
                </div>
                <time dateTime={item.created_at} className="shrink-0 text-sm text-slate-400">
                  {formatActivityTime(item.created_at)}
                </time>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-300/50 bg-slate-950/30 px-3 py-4 text-center text-xs text-slate-300 sm:text-sm">
                <Box className="h-6 w-6 shrink-0 text-slate-200" />
                Vault changes will appear here.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600/70 text-blue-100">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-200 sm:text-xs">Security alerts</p>
                <h2 className="mt-1 text-base font-semibold text-white sm:text-xl">Recent security events</h2>
              </div>
            </div>
            <ShieldAlert className="h-6 w-6 shrink-0 text-amber-300" />
          </div>

          <div className="space-y-3">
            {securityEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-blue-400/30 bg-slate-950/60 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{securityEventLabels[event.event_type] ?? "Security event recorded"}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${event.severity === "warning" ? "bg-amber-500/10 text-amber-300" : "bg-blue-500/10 text-blue-300"}`}>
                    {event.severity}
                  </span>
                </div>
                <time dateTime={event.created_at} className="mt-2 block text-sm leading-6 text-slate-400">
                  {formatActivityTime(event.created_at)}
                </time>
              </div>
            ))}
            {securityEvents.length === 0 && (
              <p className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-300/50 bg-slate-950/30 px-3 py-4 text-center text-xs text-slate-300 sm:text-sm">
                <Bell className="h-5 w-5 shrink-0 text-slate-100" />
                No security events have been recorded.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/50 to-slate-950 p-4 sm:mt-6 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-200" />
          <h2 className="text-lg font-semibold text-white sm:text-xl">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "Add Password", href: "/passwords", icon: KeyRound, color: "border-blue-400/40 bg-blue-500/10 text-sky-300" },
            { label: "New Note", href: "/notes", icon: NotebookPen, color: "border-violet-400/40 bg-violet-500/10 text-fuchsia-300" },
            { label: "Add Identity", href: "/identities", icon: IdCard, color: "border-teal-400/40 bg-teal-500/10 text-emerald-300" },
            { label: "Add Record", href: "/cards", icon: CreditCard, color: "border-amber-400/40 bg-amber-500/10 text-amber-300" },
          ].map(({ label, href, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-3 text-center text-[10px] font-medium leading-tight text-slate-100 transition-colors hover:bg-slate-800/80 sm:min-h-28 sm:gap-3 sm:text-xs ${color}`}
            >
              <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 sm:mt-6 sm:gap-6">
        <div className="rounded-3xl border border-blue-500/20 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Session health</p>
            <Wifi className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between"><span>Trusted devices</span><span className="text-white">{devicesResult.count ?? 0}</span></div>
            <div className="flex items-center justify-between"><span>Vault encryption</span><span className={vault ? "text-emerald-300" : "text-amber-300"}>{vault ? "Configured" : "Setup needed"}</span></div>
            <div className="flex items-center justify-between"><span>Recovery key</span><span className={recoveryReady ? "text-emerald-300" : "text-amber-300"}>{recoveryReady ? "Ready" : "Not set"}</span></div>
          </div>
        </div>

        <div className="rounded-3xl border border-blue-500/20 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Security posture</p>
            <Activity className="h-4 w-4 text-violet-300" />
          </div>
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
              <span>Vault encryption</span>
              <span className={vault ? "text-emerald-300" : "text-amber-300"}>{vault ? "Configured" : "Setup needed"}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 ${vault ? "w-full" : "w-0"}`} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {vault
                ? "Your vault is encrypted before records are stored. Item details are not visible to the server."
                : "Set up vault encryption to protect your records."}
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
