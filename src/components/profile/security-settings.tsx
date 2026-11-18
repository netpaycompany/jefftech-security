"use client";

import Link from "next/link";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

import { ExtensionSessions } from "@/components/settings/extension-sessions";
import { useVault } from "@/components/vault/vault-provider";
import { MfaSettings } from "@/components/profile/mfa-settings";

export function SecuritySettings() {
  const { session } = useVault();

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Account protection</p>
        <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">Security Settings</h2>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-cyan-300" />
              <div>
                <p className="text-sm font-medium text-white">Account password</p>
                <p className="text-xs text-slate-400">Update the password used to sign in</p>
              </div>
            </div>
            <Link href="/update-password" className="rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10">
              Change password
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-cyan-300" />
              <div>
                <p className="text-sm font-medium text-white">Vault encryption</p>
                <p className="text-xs text-slate-400">{session ? "Vault unlocked on this device" : "Vault locked on this device"}</p>
              </div>
            </div>
            <Link href="/master-password" className="rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10">
              {session ? "Manage encryption" : "Unlock vault"}
            </Link>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div>
              <p className="text-sm font-medium text-white">Automatic vault lock</p>
              <p className="text-xs text-slate-400">Locks after 15 minutes of inactivity to protect decrypted vault data.</p>
            </div>
          </div>
        </div>
      </section>

      <MfaSettings />
      <ExtensionSessions />
    </div>
  );
}
