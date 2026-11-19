import { isAdminError, requireAdmin } from "@/lib/admin/server";

export async function GET() {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;

  const retentionCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000).toISOString();
  const { error: cleanupError } = await access.adminClient
    .from("website_visits")
    .delete()
    .lt("last_seen_at", retentionCutoff);
  if (cleanupError) {
    return Response.json({ error: "Expired website analytics could not be removed." }, { status: 503 });
  }

  const { data, error } = await access.adminClient.rpc("get_admin_website_analytics", {
    p_now: new Date().toISOString(),
  });
  if (error) {
    return Response.json({ error: "Website analytics are unavailable. Apply the website analytics migration." }, { status: 503 });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
