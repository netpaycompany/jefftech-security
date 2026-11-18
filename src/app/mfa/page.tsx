"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Fingerprint, LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default function MfaChallengePage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState("");
  const [nextPath, setNextPath] = useState("/dashboard");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timerId = window.setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams(window.location.search);
        const destination = safeInternalPath(params.get("next"), "/dashboard", window.location.origin);
        const client = createClient();
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError) throw new Error(`Unable to verify your sign-in: ${userError.message}`);
        if (!user) {
          router.replace(`/login?next=${encodeURIComponent(destination)}`);
          return;
        }
        const { data, error: factorError } = await client.auth.mfa.listFactors();
        if (factorError) throw new Error(`Unable to load your authenticator: ${factorError.message}`);
        const factor = data.totp.find((candidate: { id: string; status: string }) => candidate.status === "verified");
        if (!factor) {
          throw new Error("No verified authenticator is available for this account. Sign in again or contact support.");
        }
        if (active) {
          setNextPath(destination);
          setFactorId(factor.id);
        }
      })().catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to prepare two-factor verification.");
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const client = createClient();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(`Unable to start two-factor verification: ${challengeError.message}`);
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw new Error(`The authenticator code was not accepted: ${verifyError.message}`);
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to verify your authenticator code.");
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-[30px] border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-blue-950/30 sm:p-8">
        <div className="mb-6"><BrandLogo size={48} /></div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
        <div className="mt-3 flex items-center gap-3">
          <Fingerprint className="h-8 w-8 text-cyan-300" />
          <h1 className="text-2xl font-semibold text-white">Two-factor verification</h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">Enter the current six-digit code from your authenticator app to finish signing in.</p>
        {isLoading ? (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Preparing verification…</p>
        ) : factorId ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label htmlFor="mfa-login-code" className="block text-sm text-slate-300">
              Authenticator code
              <input id="mfa-login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-center font-mono text-lg tracking-[0.35em] text-white" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || !code}>
              {isSubmitting ? "Verifying…" : "Verify and continue"}
            </Button>
          </form>
        ) : error ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>
        ) : null}
        <Link href="/login" className="mt-5 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Return to sign in
        </Link>
      </section>
    </main>
  );
}
