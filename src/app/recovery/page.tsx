import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function RecoveryPage() {
  return (
    <AppShell title="Vault Recovery" activePath="/recovery">
      <section className="max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">User-held recovery</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Keep your recovery key offline</h2>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          The recovery key is shown only during vault setup and must be kept somewhere you control. The server stores only an encrypted copy of the vault key; it does not store the recovery key itself.
        </p>
        <p className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
          If you forget your master password and have not kept the recovery key, administrators cannot recover the vault contents. The account password reset does not decrypt vault data.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Recovery-key-based unlock and master-password rotation are available in the vault access flow. This page never displays or fabricates a recovery key.
        </p>
        <Link href="/master-password" className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
          Open vault access and recovery
        </Link>
      </section>
    </AppShell>
  );
}
