"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useVault } from "@/components/vault/vault-provider";

export function SignOutButton() {
  const router = useRouter();
  const { lock } = useVault();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError("");

    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }
      lock();
      router.replace("/login");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        {isSigningOut ? "Signing out..." : "Sign out"}
      </button>
      {error && <p role="alert" className="mt-1 max-w-48 text-xs text-red-300">{error}</p>}
    </div>
  );
}
