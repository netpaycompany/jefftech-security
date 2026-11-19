"use client";

import type { ReactNode } from "react";

import { useVault } from "@/components/vault/vault-provider";

export function VaultSessionGate({ children }: { children: ReactNode }) {
  const { restoreStatus, restoreError } = useVault();

  if (restoreStatus === "restoring") {
    return (
      <div role="status" className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-sm text-slate-300">
        Restoring your vault session…
      </div>
    );
  }

  return (
    <>
      {restoreError && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
          {restoreError} Unlock your vault again to continue.
        </p>
      )}
      {children}
    </>
  );
}
