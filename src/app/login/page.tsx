"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discardGoogleSignupDraft, GoogleAuthButton } from "@/components/auth/google-auth-button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isCredentialError, setIsCredentialError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestedPath = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("next");
  const googleRedirectPath = safeInternalPath(
    requestedPath,
    "/dashboard",
    typeof window === "undefined" ? "https://jefftech.invalid" : window.location.origin,
  );
  const googleCompletionPath = `/auth/google-complete?mode=signin&next=${encodeURIComponent(googleRedirectPath)}`;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "oauth" && active) {
        discardGoogleSignupDraft();
        setError("Google sign-in was not completed. Please try again.");
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsCredentialError(false);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        const invalidCredentials = signInError.code === "invalid_credentials";
        setIsCredentialError(invalidCredentials);
        setError(invalidCredentials
          ? "We couldn't sign you in with those details. Check your email and account password (not your vault master password)."
          : signInError.message);
        return;
      }

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const nextPath = safeInternalPath(requestedPath, "/dashboard", window.location.origin);
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-[30px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-950/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
            <p className="text-lg font-semibold text-white">PASSWORD VAULT</p>
          </div>
        </div>

        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to unlock your encrypted vault securely.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <GoogleAuthButton redirectPath={googleCompletionPath} disabled={isSubmitting} />
          <div className="relative py-1 text-center">
            <span className="bg-slate-900 px-3 text-xs text-slate-500">or sign in with email</span>
            <span aria-hidden="true" className="absolute left-0 right-0 top-1/2 -z-0 border-t border-slate-800" />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-slate-300">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm text-slate-300">
              Account password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end text-sm text-slate-400">
            <Link href="/reset-password" className="text-blue-300 hover:text-blue-200">
              Forgot password?
            </Link>
          </div>

          {!isSupabaseConfigured() && (
            <p role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
              Supabase Auth is not configured. Add the project publishable key to .env.local.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">
              {error}
              {isCredentialError && (
                <>
                  {" "}
                  <Link href="/reset-password" className="font-medium text-blue-300 underline hover:text-blue-200">
                    Reset your account password
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={!isSupabaseConfigured() || isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
            {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
          New to Jefftech? <Link href="/signup" className="font-medium text-blue-300">Create account</Link>
        </div>
      </div>
    </main>
  );
}
