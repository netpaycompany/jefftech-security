"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update your password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6"><BrandLogo size={48} /></div>
        <h1 className="text-2xl font-semibold text-white">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-400">Use at least 12 characters to secure your account.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm text-slate-300">New password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirm-new-password" className="mb-2 block text-sm text-slate-300">Confirm new password</label>
            <input
              id="confirm-new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
          {!isSupabaseConfigured() && <p role="alert" className="text-sm text-amber-200">Add the Supabase publishable key to .env.local before using auth.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={!isSupabaseConfigured() || isSubmitting}>
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
      </section>
    </main>
  );
}
