import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

const publicPaths = new Set(["/", "/login", "/signup", "/reset-password", "/auth/callback", "/auth/google-complete", "/admin/login"]);

function addSecurityHeaders(response: NextResponse, contentSecurityPolicy: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

function createContentSecurityPolicy(nonce: string) {
  const supabaseOrigin = isSupabaseConfigured() ? new URL(supabaseUrl).origin : "";
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin} wss://*.supabase.co https://api.pwnedpasswords.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].filter(Boolean).join("; ");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(18));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  nonceBytes.fill(0);
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", contentSecurityPolicy);
  const secure = (response: NextResponse) => addSecurityHeaders(response, contentSecurityPolicy);

  if (process.env.NODE_ENV === "production" && request.nextUrl.protocol !== "https:") {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https:";
    return secure(NextResponse.redirect(httpsUrl, 308));
  }

  if (publicPaths.has(pathname)) {
    return secure(NextResponse.next({ request }));
  }

  const loginUrl = new URL("/login", request.url);
  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("setup", "supabase");
    return secure(NextResponse.redirect(loginUrl));
  }

  let response = secure(NextResponse.next({ request }));
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = secure(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    loginUrl.searchParams.set("next", pathname);
    return secure(NextResponse.redirect(loginUrl));
  }

  if (pathname.startsWith("/admin") && data.claims.app_metadata?.role !== "admin") {
    return secure(NextResponse.redirect(new URL("/admin/login", request.url)));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};