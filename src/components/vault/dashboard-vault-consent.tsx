"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, X } from "lucide-react";

import { VAULT_CONSENT_SESSION_KEY } from "@/lib/vault-consent";

export function DashboardVaultConsent() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return null;
  }

  const continueToSetup = () => {
    window.sessionStorage.setItem(VAULT_CONSENT_SESSION_KEY, "accepted");
    router.push("/master-password?next=%2Fdashboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-vault-consent-title"
        className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-blue-400/40 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-blue-950/50 sm:p-7"
      >
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close vault encryption prompt"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-cyan-300">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-blue-300">Protect your vault</p>
        <h2 id="dashboard-vault-consent-title" className="mt-2 pr-8 text-2xl font-semibold text-white sm:text-3xl">
          Allow Jefftech Security to encrypt your vault data?
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Your account is signed in, but an encrypted vault has not been set up yet. Continue to create your vault and protect the information you choose to save.
        </p>
        <div className="mt-4 rounded-2xl border border-blue-500/25 bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">
          Your records are encrypted on this device before syncing. Jefftech does not read passwords from other websites or access everything on your device. You choose what to add, and your master password is never sent to us.
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          You can dismiss this prompt and continue using your account. Vault features that need encryption will remain unavailable until setup is complete.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="min-h-11 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={continueToSetup}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Allow and set up vault
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
