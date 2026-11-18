import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { ExtensionSessions } from "@/components/settings/extension-sessions";

export default function SettingsPage() {
  return (
    <AppShell title="Settings" activePath="/settings">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Account security</p>
          <div className="mt-5 space-y-4 text-sm text-slate-300">
            <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <span>Two-factor authentication</span>
              <Link href="/profile/security-settings" className="text-blue-300 hover:text-blue-200">Manage</Link>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <span>Master password recovery</span>
              <Link href="/profile/recovery-options" className="text-blue-300 hover:text-blue-200">Recovery options</Link>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <span>Security notifications</span>
              <span className="text-emerald-300">In-app bell</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Session controls</p>
          <div className="mt-5 space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              Auto-lock timeout: 15 minutes
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              Browser extension lock: automatic after inactivity
            </div>
            <Link href="/profile/my-devices" className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-blue-200 hover:border-blue-500/40">
              Review and remove registered devices
            </Link>
          </div>

          <ExtensionSessions />

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Vault encryption</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Rotate the vault key to re-encrypt all records with a fresh key and advance the encryption version. You must have both your master password and user-held recovery key.
            </p>
            <Link href="/master-password" className="mt-5 inline-flex rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-500/20">
              Manage vault encryption
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
