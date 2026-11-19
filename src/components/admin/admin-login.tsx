"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const client = createClient();
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      setPassword("");
      if (signInError) throw new Error("Sign-in failed. Check your credentials.");
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        await client.auth.signOut();
        throw new Error(response.status === 403
          ? "This account does not have the administrator role."
          : body.error ?? "Administrator authentication could not be verified.");
      }
      router.replace("/admin");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Administrator sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-lg rounded-[32px] border border-slate-800 bg-slate-900 p-8">
        <div className="mb-6 flex items-center gap-3">
          <BrandLogo size={56} />
          <div><p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Jefftech Security</p><p className="text-lg font-semibold text-white">ADMIN ACCESS</p></div>
        </div>
        <h1 className="text-2xl font-semibold text-white">Administrator sign-in</h1>
        <p className="mt-2 text-sm text-slate-400">Use a Supabase account assigned the administrator role in trusted app metadata.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
          <label className="block text-sm text-slate-300">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
          {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>{isSubmitting ? "Verifying…" : "Sign in to admin"}</Button>
        </form>
        <p className="mt-6 border-t border-slate-800 pt-5 text-center text-sm text-slate-400">Return to <Link href="/login" className="text-blue-300">user sign-in</Link></p>
      </div>
    </main>
  );
}
