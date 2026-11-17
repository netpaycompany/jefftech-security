import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Activity, ArrowUpRight, ShieldAlert, UserRound, Wifi, Zap } from "lucide-react";
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
    { label: "Saved passwords", value: passwordsResult?.count ?? 0, detail: "Encrypted in your vault" },
    { label: "Secure notes", value: notesResult?.count ?? 0, detail: "Encrypted in your vault" },
    { label: "Saved identities", value: identitiesResult?.count ?? 0, detail: "Encrypted in your vault" },
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
    },
  ];
  const activity = (activityResult?.data ?? []) as ActivityRow[];
  const securityEvents = (securityEventsResult.data ?? []) as SecurityEventRow[];
  const recoveryReady = Boolean(keyResult?.data?.recovery_ciphertext);

  return (
    <AppShell title="Overview" activePath="/dashboard">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20 text-xl font-semibold text-blue-200">
            {initials}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your profile</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{displayName}</h2>
            <p className="mt-1 text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          <UserRound className="h-4 w-4" />
          Manage profile
        </Link>
      </section>

      <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">{metric.label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">{metric.value.toLocaleString()}</p>
            <p className="mt-3 text-xs text-slate-500">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent activity</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent vault changes</h2>
            </div>
            <Link href="/security" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
              Security center <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
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
            {activity.length === 0 && <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Vault changes will appear here.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Security alerts</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent security events</h2>
            </div>
            <ShieldAlert className="h-5 w-5 text-amber-300" />
          </div>

          <div className="space-y-3">
            {securityEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{securityEventLabels[event.event_type] ?? "Security event recorded"}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${event.severity === "warning" ? "bg-amber-500/10 text-amber-300" : "bg-blue-500/10 text-blue-300"}`}>
                    {event.severity}
                  </span>
                </div>
                <time dateTime={event.created_at} className="mt-2 block text-sm leading-6 text-slate-400">
                  {formatActivityTime(event.created_at)}
                </time>
              </div>
            ))}
            {securityEvents.length === 0 && <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No security events have been recorded.</p>}
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quick actions</p>
            <Zap className="h-4 w-4 text-blue-300" />
          </div>
          <div className="mt-5 space-y-3">
            {[
              { label: "Add new password", href: "/passwords" },
              { label: "Generate secure password", href: "/generator" },
              { label: "Create secure note", href: "/notes" },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-left text-sm text-slate-200 hover:border-slate-600">
                {action.label} <ArrowUpRight className="h-4 w-4 text-blue-300" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Session health</p>
            <Wifi className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="mt-5 space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between"><span>Trusted devices</span><span className="text-white">{devicesResult.count ?? 0}</span></div>
            <div className="flex items-center justify-between"><span>Vault encryption</span><span className={vault ? "text-emerald-300" : "text-amber-300"}>{vault ? "Configured" : "Setup needed"}</span></div>
            <div className="flex items-center justify-between"><span>Recovery key</span><span className={recoveryReady ? "text-emerald-300" : "text-amber-300"}>{recoveryReady ? "Ready" : "Not set"}</span></div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Security posture</p>
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
