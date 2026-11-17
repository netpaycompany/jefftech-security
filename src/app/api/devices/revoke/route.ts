import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin device changes are not allowed." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return Response.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  const authClient = await createClient();
  const [{ data: { user }, error: userError }, { data: { session }, error: sessionError }] = await Promise.all([
    authClient.auth.getUser(),
    authClient.auth.getSession(),
  ]);
  if (userError || sessionError || !user || !session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured() || !serviceRoleKey) {
    return Response.json({ error: "Server-side device revocation is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || typeof (body as { deviceId?: unknown }).deviceId !== "string") {
    return Response.json({ error: "Invalid device ID." }, { status: 400 });
  }
  const deviceId = (body as { deviceId: string }).deviceId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
    return Response.json({ error: "Invalid device ID." }, { status: 400 });
  }

  const { error: revokeError } = await authClient.rpc("revoke_vault_device", { p_device_id: deviceId });
  if (revokeError) {
    return Response.json({ error: "Device registration could not be revoked." }, { status: 400 });
  }
  const { error: auditError } = await authClient.rpc("record_security_event", {
    p_event_type: "device_revoked",
    p_severity: "warning",
  });

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: signOutError } = await adminClient.auth.admin.signOut(session.access_token, "global");
  if (signOutError) {
    return Response.json({
      revoked: true,
      signedOutAllDevices: false,
      auditLogged: !auditError,
      error: "The device registration was revoked, but all account sessions could not be invalidated. Sign out from active devices and retry.",
    }, { status: 503 });
  }
  return Response.json({ revoked: true, signedOutAllDevices: true, auditLogged: !auditError }, { headers: { "Cache-Control": "no-store" } });
}
