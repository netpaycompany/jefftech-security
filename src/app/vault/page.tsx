"use client";

import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";

export default function VaultPage() {
  const { session } = useVault();

  return (
    <AppShell title="Vault Items" activePath="/vault">
      <section className="max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Client-side encryption</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Saved credentials</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Password records are encrypted independently in your browser before they are stored. Service names, usernames, notes, tags, and passwords remain inside each encrypted record.
        </p>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-400">Vault status</p>
          <p className="mt-2 text-xl font-semibold text-white">{session ? "Unlocked" : "Locked"}</p>
          <p className="mt-2 text-sm text-slate-400">
            {session ? `${session.records.length} encrypted credentials` : "Unlock to view your credential count."}
          </p>
          {session && <p className="mt-2 text-xs text-slate-500">Encryption key version {session.keyVersion}</p>}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={session ? "/passwords" : "/master-password"} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            {session ? "Open passwords" : "Unlock vault"}
          </Link>
          <Link href="/master-password" className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-600">
            Manage encryption and recovery
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
