"use client";

import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { useVault } from "@/components/vault/vault-provider";

export function VaultLockButton() {
  const router = useRouter();
  const { lock, session } = useVault();

  const handleLock = () => {
    lock();
    router.replace("/master-password");
  };

  return (
    <button
      type="button"
      onClick={handleLock}
      disabled={!session}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LockKeyhole className="h-4 w-4" />
      {session ? "Lock vault" : "Vault locked"}
    </button>
  );
}
