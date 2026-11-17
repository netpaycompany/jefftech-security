"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { GoogleAuthButton, saveGoogleSignupDraft } from "@/components/auth/google-auth-button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 12) {
      setError("Use an account password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!acceptedTerms) {
      setError("Accept the Privacy Policy and Terms of Service to continue.");
      return;
    }
    const normalizedReferralCode = referralCode.trim().toUpperCase();
    if (normalizedReferralCode.length > 64 || !/^[A-Z0-9_-]*$/.test(normalizedReferralCode)) {
      setError("Referral codes can contain only letters, numbers, hyphens, and underscores.");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { data, error: signupError } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName,
            referral_code: normalizedReferralCode || null,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/master-password`,
        },
      });
      if (signupError) {
        setError(signupError.message);
        return;
      }

      if (data.session) {
        router.replace("/master-password");
        router.refresh();
      } else {
        setNotice("Check your email for a confirmation link. After confirming, you’ll continue to vault setup.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create your account right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-xl rounded-[30px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-950/30">
        <div className="mb-6 flex items-center gap-3">
          <BrandLogo size={48} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
            <p className="text-lg font-semibold text-white">Create account</p>
          </div>
        </div>

        <h1 className="text-3xl font-semibold text-white">Protect your vault</h1>
        <p className="mt-2 text-sm text-slate-400">
          Secure your credentials with a zero-knowledge vault built for everyday privacy.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <GoogleAuthButton
              redirectPath="/auth/google-complete?mode=signup"
              disabled={isSubmitting}
              beforeRedirect={() => {
                if (!acceptedTerms) return "Accept the Privacy Policy and Terms of Service to continue.";
                const normalizedReferralCode = referralCode.trim().toUpperCase();
                if (normalizedReferralCode.length > 64 || !/^[A-Z0-9_-]*$/.test(normalizedReferralCode)) {
                  return "Referral codes can contain only letters, numbers, hyphens, and underscores.";
                }
                try {
                  saveGoogleSignupDraft(normalizedReferralCode);
                } catch {
                  return "Could not securely continue signup. Please try again.";
                }
                return null;
              }}
            />
            <div className="relative mt-5 text-center">
              <span className="bg-slate-900 px-3 text-xs text-slate-500">or create an account with email</span>
              <span aria-hidden="true" className="absolute left-0 right-0 top-1/2 -z-0 border-t border-slate-800" />
            </div>
          </div>
          <div className="md:col-span-1">
            <label htmlFor="first-name" className="mb-2 block text-sm text-slate-300">First name</label>
            <input id="first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </div>
          <div className="md:col-span-1">
            <label htmlFor="last-name" className="mb-2 block text-sm text-slate-300">Last name</label>
            <input id="last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="signup-email" className="mb-2 block text-sm text-slate-300">Email address</label>
            <input id="signup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="signup-referral-code" className="mb-2 block text-sm text-slate-300">Referral code <span className="text-slate-500">(optional)</span></label>
            <input id="signup-referral-code" type="text" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} autoComplete="off" maxLength={64} aria-describedby="referral-code-help" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
            <p id="referral-code-help" className="mt-2 text-xs text-slate-500">Enter an invite code if someone referred you.</p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="signup-password" className="mb-2 block text-sm text-slate-300">Create account password</label>
            <input id="signup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="confirm-password" className="mb-2 block text-sm text-slate-300">Confirm account password</label>
            <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-950" />
            I agree to the Privacy Policy and Terms of Service.
          </label>
          <div className="md:col-span-2">
            {!isSupabaseConfigured() && (
              <p role="alert" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
                Supabase Auth is not configured. Add the project publishable key to .env.local.
              </p>
            )}
            {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
            {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
            <Button className="w-full" size="lg" type="submit" disabled={!isSupabaseConfigured() || isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create account"}
              {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
          Already have an account? <Link href="/login" className="font-medium text-blue-300">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
