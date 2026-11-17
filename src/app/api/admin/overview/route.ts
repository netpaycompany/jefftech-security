import { isAdminError, requireAdmin } from "@/lib/admin/server";

export async function GET() {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [profiles, recentProfileUpdates, verifiedProfiles, vaults, recentEvents, plans] = await Promise.all([
    access.adminClient.from("profiles").select("id", { count: "exact", head: true }),
    access.adminClient.from("profiles").select("id", { count: "exact", head: true }).gte("updated_at", thirtyDaysAgo),
    access.adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("email_verified", true),
    access.adminClient.from("vaults").select("id", { count: "exact", head: true }),
    access.adminClient.from("security_events")
      .select("event_type,severity,created_at")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(50),
    access.adminClient.from("account_subscriptions").select("plan_code,status"),
  ]);
  const failure = profiles.error ?? recentProfileUpdates.error ?? verifiedProfiles.error ?? vaults.error ?? recentEvents.error ?? plans.error;
  if (failure) {
    return Response.json({ error: "Operational metrics could not be loaded." }, { status: 503 });
  }

  const subscriptionCounts = (plans.data ?? []).reduce<Record<string, number>>((counts, row) => {
    const key = `${row.plan_code}:${row.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const activity = (recentEvents.data ?? []).map((event) => ({
    eventType: event.event_type,
    severity: event.severity,
    createdAt: event.created_at,
  }));
  return Response.json({
    registeredUsers: profiles.count ?? 0,
    profilesUpdatedLast30Days: recentProfileUpdates.count ?? 0,
    verifiedUsers: verifiedProfiles.count ?? 0,
    vaults: vaults.count ?? 0,
    securityEventsLast24Hours: activity,
    subscriptionCounts,
    database: "available",
  }, { headers: { "Cache-Control": "no-store" } });
}
