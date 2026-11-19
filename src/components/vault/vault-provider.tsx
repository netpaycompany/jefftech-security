"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session as SupabaseSession } from "@supabase/supabase-js";

import { decodeCanonicalBase64, bytesToBase64 } from "@/lib/security";
import { loadEncryptedVaultRecords, type VaultItem } from "@/lib/vault";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const VAULT_SESSION_STORAGE_KEY = "jefftech.vault-session";

type VaultSession = {
  userId: string;
  vaultId: string;
  keyVersion: string;
  key: Uint8Array;
  records: VaultItem[];
};

type StoredVaultSession = {
  userId: string;
  vaultId: string;
  keyVersion: string;
  key: string;
};

type VaultContextValue = {
  session: VaultSession | null;
  restoreStatus: "restoring" | "ready";
  restoreError: string | null;
  unlock: (nextSession: VaultSession) => void;
  replaceSession: (nextSession: VaultSession) => void;
  setRecords: (records: VaultItem[]) => void;
  lock: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VaultSession | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<"restoring" | "ready">("restoring");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const keyRef = useRef<Uint8Array | null>(null);

  const lock = useCallback(() => {
    keyRef.current?.fill(0);
    keyRef.current = null;
    window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
    setSession(null);
    setRestoreError(null);
  }, []);

  const unlock = useCallback((nextSession: VaultSession) => {
    window.sessionStorage.setItem(VAULT_SESSION_STORAGE_KEY, JSON.stringify({
      userId: nextSession.userId,
      vaultId: nextSession.vaultId,
      keyVersion: nextSession.keyVersion,
      key: bytesToBase64(nextSession.key),
    } satisfies StoredVaultSession));
    keyRef.current?.fill(0);
    keyRef.current = nextSession.key;
    setSession(nextSession);
    setRestoreError(null);
  }, []);

  const replaceSession = useCallback((nextSession: VaultSession) => {
    window.sessionStorage.setItem(VAULT_SESSION_STORAGE_KEY, JSON.stringify({
      userId: nextSession.userId,
      vaultId: nextSession.vaultId,
      keyVersion: nextSession.keyVersion,
      key: bytesToBase64(nextSession.key),
    } satisfies StoredVaultSession));
    keyRef.current?.fill(0);
    keyRef.current = nextSession.key;
    setSession(nextSession);
    setRestoreError(null);
  }, []);

  const setRecords = useCallback((records: VaultItem[]) => {
    setSession((current) => current ? { ...current, records } : current);
  }, []);

  useEffect(() => {
    let active = true;
    let restoredKey: Uint8Array | null = null;

    const restore = async () => {
      try {
        if (!isSupabaseConfigured()) {
          return;
        }

        const serializedSession = window.sessionStorage.getItem(VAULT_SESSION_STORAGE_KEY);
        if (!serializedSession) {
          return;
        }

        let storedSession: StoredVaultSession;
        try {
          const parsed: unknown = JSON.parse(serializedSession);
          if (
            typeof parsed !== "object"
            || parsed === null
            || !("userId" in parsed) || typeof parsed.userId !== "string"
            || !("vaultId" in parsed) || typeof parsed.vaultId !== "string"
            || !("keyVersion" in parsed) || typeof parsed.keyVersion !== "string"
            || !/^v[1-9]\d*$/.test(parsed.keyVersion)
            || !("key" in parsed) || typeof parsed.key !== "string"
          ) {
            throw new Error("Saved vault session data is invalid.");
          }
          storedSession = {
            userId: parsed.userId,
            vaultId: parsed.vaultId,
            keyVersion: parsed.keyVersion,
            key: parsed.key,
          };
          restoredKey = decodeCanonicalBase64(storedSession.key, 32);
        } catch (caughtError) {
          window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
          throw caughtError;
        }

        const client = createClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError) {
          throw new Error(`Unable to verify your account while restoring the vault: ${authError.message}`);
        }
        if (!user || user.id !== storedSession.userId) {
          window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
          return;
        }

        const { data: vault, error: vaultError } = await client
          .from("vaults")
          .select("id,key_version")
          .eq("profile_id", user.id)
          .eq("is_default", true)
          .maybeSingle();
        if (vaultError) {
          throw new Error(`Unable to verify vault settings while restoring the vault: ${vaultError.message}`);
        }
        if (!vault || vault.id !== storedSession.vaultId || vault.key_version !== storedSession.keyVersion) {
          window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
          return;
        }

        const records = await loadEncryptedVaultRecords(
          user.id,
          storedSession.vaultId,
          storedSession.keyVersion,
          restoredKey,
        );
        const { data: { user: currentUser }, error: currentUserError } = await client.auth.getUser();
        if (currentUserError) {
          throw new Error(`Unable to verify your account after restoring the vault: ${currentUserError.message}`);
        }
        if (!active || !currentUser || currentUser.id !== storedSession.userId) {
          window.sessionStorage.removeItem(VAULT_SESSION_STORAGE_KEY);
          return;
        }

        keyRef.current?.fill(0);
        keyRef.current = restoredKey;
        setSession({
          userId: user.id,
          vaultId: storedSession.vaultId,
          keyVersion: storedSession.keyVersion,
          key: restoredKey,
          records,
        });
        restoredKey = null;
      } catch (caughtError) {
        if (active) {
          setRestoreError(caughtError instanceof Error
            ? caughtError.message
            : "Unable to restore the unlocked vault session.");
        }
      } finally {
        restoredKey?.fill(0);
        if (active) {
          setRestoreStatus("ready");
        }
      }
    };

    void restore();
    return () => {
      active = false;
      restoredKey?.fill(0);
    };
  }, []);

  const sessionUserId = session?.userId;

  useEffect(() => {
    if (!sessionUserId || !isSupabaseConfigured()) {
      return;
    }

    const { data: { subscription } } = createClient().auth.onAuthStateChange(
      (_event: AuthChangeEvent, authSession: SupabaseSession | null) => {
      if (!authSession || authSession.user.id !== sessionUserId) {
        lock();
      }
      },
    );
    return () => subscription.unsubscribe();
  }, [lock, sessionUserId]);

  useEffect(() => () => {
    keyRef.current?.fill(0);
    keyRef.current = null;
  }, []);

  return (
    <VaultContext.Provider value={{ session, restoreStatus, restoreError, unlock, replaceSession, setRecords, lock }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("VaultProvider is missing from the application tree.");
  }
  return context;
}
