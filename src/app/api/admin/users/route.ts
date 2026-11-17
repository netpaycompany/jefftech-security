import { isAdminError, requireAdmin } from "@/lib/admin/server";

export async function GET() {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;

  const [{ data, error }, { data: authData, error: authError }] = await Promise.all([
    access.adminClient
    .from("profiles")
    .select("id,email,full_name,email_verified,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200),
    access.adminClient.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);
  if (error || authError) {
    return Response.json({ error: "Account directory could not be loaded." }, { status: 503 });
  }
  const authUsers = new Map((authData.users ?? []).map((user) => [user.id, user]));
  const users = (data ?? []).map((profile) => {
    const authUser = authUsers.get(profile.id);
    const bannedUntil = authUser?.banned_until ? Date.parse(authUser.banned_until) : 0;
    return { ...profile, suspended: bannedUntil > Date.now() };
  });
  return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin account changes are not allowed." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return Response.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { userId, suspended } = body as { userId?: unknown; suspended?: unknown };
  if (
    typeof userId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    || typeof suspended !== "boolean"
    || userId === access.user.id
  ) {
    return Response.json({ error: "Invalid account action." }, { status: 400 });
  }

  const { error } = await access.adminClient.auth.admin.updateUserById(userId, {
    ban_duration: suspended ? "87600h" : "none",
  });
  if (error) {
    return Response.json({ error: "The account status could not be updated." }, { status: 400 });
  }
  return Response.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
}
