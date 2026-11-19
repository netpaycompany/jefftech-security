import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VISIT_DURATION_SECONDS = 7_200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePagePath(value: string) {
  if (value.length < 1 || value.length > 300 || !value.startsWith("/") || /[?#]/.test(value)) return null;
  const normalized = value.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
    "/:id",
  );
  if (normalized.startsWith("/admin") || normalized.startsWith("/api/") || normalized.startsWith("/_next/")) return null;
  return normalized;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin analytics requests are not allowed." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return Response.json({ error: "Expected a JSON request." }, { status: 415 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Website analytics storage is not configured." }, { status: 503 });
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return Response.json({ error: "Website analytics storage is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  }
  if (!isRecord(body)
    || typeof body.visitId !== "string"
    || !UUID_PATTERN.test(body.visitId)
    || typeof body.sessionId !== "string"
    || !UUID_PATTERN.test(body.sessionId)
    || typeof body.pagePath !== "string"
    || !normalizePagePath(body.pagePath)
    || !Number.isInteger(body.durationSeconds)
    || (body.durationSeconds as number) < 0
    || (body.durationSeconds as number) > MAX_VISIT_DURATION_SECONDS) {
    return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  }

  let profileId: string | null = null;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (user) profileId = user.id;

  const countryHeader = request.headers.get("x-vercel-ip-country");
  const hasVercelRequestId = Boolean(request.headers.get("x-vercel-id"));
  const countryCode = hasVercelRequestId && countryHeader && /^[A-Za-z]{2}$/.test(countryHeader)
    ? countryHeader.toUpperCase()
    : null;
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await adminClient.rpc("record_website_visit", {
    p_visit_id: body.visitId,
    p_session_id: body.sessionId,
    p_profile_id: profileId,
    p_page_path: normalizePagePath(body.pagePath),
    p_country_code: countryCode,
    p_duration_seconds: body.durationSeconds,
  });
  if (error) {
    return Response.json({ error: "The analytics event could not be saved." }, { status: 503 });
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
