import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  redirectUri: z.string().url(),
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

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
    return NextResponse.json({ error: "The extension cancellation request is invalid." }, { status: 400 });
  }
  const allowedUris = (process.env.JEFFTECH_EXTENSION_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let redirect: URL;
  try {
    redirect = new URL(parsed.data.redirectUri);
  } catch {
    return NextResponse.json({ error: "The extension redirect URI is invalid." }, { status: 400 });
  }
  if (
    !allowedUris.includes(parsed.data.redirectUri)
    || redirect.protocol !== "https:"
    || !redirect.hostname.endsWith(".chromiumapp.org")
    || redirect.pathname !== "/"
    || redirect.search
    || redirect.hash
  ) {
    return NextResponse.json({ error: "This extension redirect URI is not registered." }, { status: 400 });
  }

  redirect.searchParams.set("error", "access_denied");
  redirect.searchParams.set("state", parsed.data.state);
  return NextResponse.json(
    { redirectUrl: redirect.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
