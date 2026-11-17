import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  redirectUri: z.string().url(),
}).strict();

function allowedRedirectUris() {
  return (process.env.JEFFTECH_EXTENSION_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : request.nextUrl.origin;
  if (request.headers.get("origin") !== expectedOrigin || request.nextUrl.origin !== expectedOrigin) {
    return NextResponse.json({ error: "The authorization request origin is not allowed." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "The extension authorization request is invalid." }, { status: 400 });
  }

  const allowedUris = allowedRedirectUris();
  const redirectUri = parsed.data.redirectUri;
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return NextResponse.json({ error: "The extension redirect URI is invalid." }, { status: 400 });
  }
  if (
    !allowedUris.includes(redirectUri)
    || redirect.protocol !== "https:"
    || !redirect.hostname.endsWith(".chromiumapp.org")
    || redirect.pathname !== "/"
    || redirect.search
    || redirect.hash
  ) {
    return NextResponse.json({ error: "This extension redirect URI is not registered." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: "Unable to verify the signed-in Jefftech account." }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Sign in to Jefftech Security before connecting the extension." }, { status: 401 });
  }

  const code = randomBytes(32).toString("base64url");
  const { error: authorizationError } = await supabase.rpc("create_extension_authorization", {
    p_code: code,
    p_code_challenge: parsed.data.codeChallenge,
  });
  if (authorizationError) {
    return NextResponse.json({ error: "Could not create an extension authorization code." }, { status: 500 });
  }

  redirect.searchParams.set("code", code);
  return NextResponse.json(
    { redirectUrl: redirect.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
