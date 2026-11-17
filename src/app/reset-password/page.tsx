"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setNotice("If an account exists for that email, a password reset link has been sent.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to request a password reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</span>
            <span className="block text-lg font-semibold text-white">PASSWORD VAULT</span>
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-white">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">We’ll send a secure recovery link if an account matches that email.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm text-slate-300">Email address</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
          {!isSupabaseConfigured() && <p role="alert" className="text-sm text-amber-200">Add the Supabase publishable key to .env.local before using auth.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
          <Button type="submit" className="w-full" disabled={!isSupabaseConfigured() || isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
