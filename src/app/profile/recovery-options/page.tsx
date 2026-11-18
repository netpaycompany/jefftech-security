import Link from "next/link";
import { KeyRound, ShieldAlert } from "lucide-react";

import { ProfileSectionPage } from "@/components/profile/profile-section-page";

export default function ProfileRecoveryOptionsPage() {
  return (
    <ProfileSectionPage title="Recovery Options" activeHref="/profile/recovery-options">
      <div className="space-y-4">
        <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="h-8 w-8 text-cyan-300" />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200">User-held recovery</p>
              <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">Keep your recovery key offline</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Your recovery key is shown only during vault setup and must be kept somewhere you control. The server stores only an encrypted copy of the vault key; it does not store the recovery key itself.
          </p>
          <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>If you forget your vault master password and have not kept your recovery key, administrators cannot recover the vault contents. An account password reset does not decrypt vault data.</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Recovery-key-based unlock and master-password rotation are available in the vault access flow. This page never displays or fabricates a recovery key.
          </p>
          <Link href="/master-password" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            Open vault recovery
          </Link>
        </section>

        <section className="rounded-3xl border border-blue-500/25 bg-slate-950/60 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-white">Encrypted backups</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Create an encrypted backup from My Devices while your vault is unlocked. Store the file privately; restoring backups is not available yet.
          </p>
          <Link href="/profile/my-devices" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-blue-400/40 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/10">
            Go to My Devices
          </Link>
        </section>
      </div>
    </ProfileSectionPage>
  );
}
