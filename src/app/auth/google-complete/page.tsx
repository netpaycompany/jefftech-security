"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { takeGoogleSignupDraft } from "@/components/auth/google-auth-button";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default function GoogleSignupCompletePage() {
  const router = useRouter();
  const [referralCode, setReferralCode] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams(window.location.search);
        const isSignup = params.get("mode") === "signup";
        const nextPath = safeInternalPath(params.get("next"), "/dashboard", window.location.origin);
        const client = createClient();
        const { data, error: authError } = await client.auth.getUser();
        if (!active) return;
        if (authError || !data.user) {
          router.replace("/login?error=oauth");
          return;
        }
        if (!isSignup) {
          router.replace(nextPath);
          router.refresh();
          return;
        }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) throw new Error(`Could not load your Jefftech profile: ${profileError.message}`);
        if (!profile) throw new Error("Your Jefftech profile could not be found. Please try signing up again.");

        const draft = takeGoogleSignupDraft();
        setEmail(data.user.email ?? "");
        setReferralCode(draft?.referralCode ?? "");
        setIsLoading(false);
      })().catch((caughtError: unknown) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to complete Google signup.");
          setIsLoading(false);
        }
      });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const normalizedReferralCode = referralCode.trim().toUpperCase();
    if (normalizedReferralCode.length > 64 || !/^[A-Z0-9_-]*$/.test(normalizedReferralCode)) {
      setError("Referral codes can contain only letters, numbers, hyphens, and underscores.");
      return;
    }
    if (!acceptedTerms) {
      setError("Accept the Privacy Policy and Terms of Service to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const client = createClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw new Error("Your Google session expired. Sign in again to continue.");

      const { data, error: updateError } = await client
        .from("profiles")
        .update({
          referral_code: normalizedReferralCode || null,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (updateError) throw new Error(`Could not save your signup details: ${updateError.message}`);
      if (!data) throw new Error("Your Jefftech profile could not be found. Please try signing up again.");

      const params = new URLSearchParams(window.location.search);
      const nextPath = params.get("mode") === "signup"
        ? "/master-password"
        : safeInternalPath(params.get("next"), "/dashboard", window.location.origin);
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to complete Google signup.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-[30px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-950/30">
        <div className="mb-6"><BrandLogo size={48} /></div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Finish setting up your account</h1>
        {isLoading ? (
          <p className="mt-4 text-sm text-slate-400">Checking your Google account…</p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {email ? `Signed in as ${email}. ` : ""}Review your signup details before setting up your vault.
            </p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="google-signup-referral" className="mb-2 block text-sm text-slate-300">
                  Referral code <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  id="google-signup-referral"
                  type="text"
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value)}
                  autoComplete="off"
                  maxLength={64}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950"
                />
                <span>I agree to the Privacy Policy and Terms of Service.</span>
              </label>
              {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Saving details..." : "Continue to vault setup"}
                {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
