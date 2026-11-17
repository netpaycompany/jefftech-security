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

import type { VaultItem } from "@/lib/vault";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const AUTO_LOCK_MS = 15 * 60 * 1000;

type VaultSession = {
  userId: string;
  vaultId: string;
  keyVersion: string;
  key: Uint8Array;
  records: VaultItem[];
};

type VaultContextValue = {
  session: VaultSession | null;
  unlock: (nextSession: VaultSession) => void;
  replaceSession: (nextSession: VaultSession) => void;
  setRecords: (records: VaultItem[]) => void;
  lock: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VaultSession | null>(null);
  const keyRef = useRef<Uint8Array | null>(null);
  const lastActivityRef = useRef(0);

  const lock = useCallback(() => {
    keyRef.current?.fill(0);
    keyRef.current = null;
    setSession(null);
  }, []);

  const unlock = useCallback((nextSession: VaultSession) => {
    keyRef.current?.fill(0);
    keyRef.current = nextSession.key;
    lastActivityRef.current = Date.now();
    setSession(nextSession);
  }, []);

  const replaceSession = useCallback((nextSession: VaultSession) => {
    keyRef.current?.fill(0);
    keyRef.current = nextSession.key;
    lastActivityRef.current = Date.now();
    setSession(nextSession);
  }, []);

  const setRecords = useCallback((records: VaultItem[]) => {
    setSession((current) => current ? { ...current, records } : current);
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      clearTimeout(timer);
      timer = setTimeout(lock, AUTO_LOCK_MS);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastActivityRef.current >= AUTO_LOCK_MS) {
        lock();
      }
    };
    const handleBeforeUnload = () => {
      keyRef.current?.fill(0);
      keyRef.current = null;
    };

    resetTimer();
    window.addEventListener("pointerdown", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("touchstart", resetTimer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [lock, session]);

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
    <VaultContext.Provider value={{ session, unlock, replaceSession, setRecords, lock }}>
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
