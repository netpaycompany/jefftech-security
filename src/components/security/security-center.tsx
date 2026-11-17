"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import { toPasswordVaultItem } from "@/lib/vault";

type BreachResult = Record<string, "safe" | "found">;

function isWeak(password: string) {
  return password.length < 12
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password);
}

async function checkPasswordBreach(password: string, signal: AbortSignal) {
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
  const hash = Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  hashBytes.fill(0);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Breach-check service returned HTTP ${response.status}.`);
  }
  const ranges = await response.text();
  return ranges.split(/\r?\n/).some((line) => line.split(":")[0]?.toUpperCase() === suffix);
}

export function SecurityCenter() {
  const { session } = useVault();
  const [breachResults, setBreachResults] = useState<BreachResult>({});
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");

  const passwords = (session?.records ?? [])
    .map(toPasswordVaultItem)
    .filter((record) => record !== null);
  const weak = passwords.filter((record) => isWeak(record.password));
  const passwordGroups = new Map<string, typeof passwords>();
  for (const record of passwords) {
    const records = passwordGroups.get(record.password) ?? [];
    records.push(record);
    passwordGroups.set(record.password, records);
  }
  const reused = new Set([...passwordGroups.values()].filter((group) => group.length > 1).flat().map((record) => record.id));

  const runBreachChecks = async () => {
    setError("");
    setBreachResults({});
    setIsChecking(true);
    const controller = new AbortController();
    const results: BreachResult = {};
    const checked = new Map<string, "safe" | "found">();
    try {
      for (const record of passwords) {
        let result = checked.get(record.password);
        if (!result) {
          result = await checkPasswordBreach(record.password, controller.signal) ? "found" : "safe";
          checked.set(record.password, result);
        }
        results[record.id] = result;
        setBreachResults({ ...results });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Breach checks could not be completed.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <AppShell title="Security Center" activePath="/security">
      {!session ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-white">Unlock to analyze your vault</h2>
          <p className="mt-2 text-sm text-slate-400">Weak and reused password analysis runs locally against decrypted records.</p>
          <Link href="/master-password" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white">Unlock vault</Link>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Local password analysis</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{passwords.length} saved passwords</h2>
            <dl className="mt-5 space-y-3">
              <StatusRow label="Weak passwords" value={String(weak.length)} warning={weak.length > 0} />
              <StatusRow label="Reused passwords" value={String(reused.size)} warning={reused.size > 0} />
              <StatusRow label="Known breach matches" value={String(Object.values(breachResults).filter((value) => value === "found").length)} warning={Object.values(breachResults).some((value) => value === "found")} />
            </dl>
            <ul className="mt-5 space-y-2 text-sm">
              {passwords.filter((record) => weak.includes(record) || reused.has(record.id) || breachResults[record.id] === "found").map((record) => (
                <li key={record.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-amber-100">
                  {record.site}: {[
                    weak.includes(record) ? "weak" : "",
                    reused.has(record.id) ? "reused" : "",
                    breachResults[record.id] === "found" ? "found in breach corpus" : "",
                  ].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Privacy-preserving breach check</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This optional check sends only the first five characters of each password&apos;s SHA-1 hash to Have I Been Pwned. The password and remaining hash suffix stay on this device. The service will still see your IP address and requested prefixes.
            </p>
            <button type="button" onClick={() => void runBreachChecks()} disabled={isChecking || passwords.length === 0} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {isChecking ? "Checking..." : "Check breach status"}
            </button>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            <p className="mt-5 text-xs leading-5 text-slate-500">Security recommendations: use unique, long passwords; keep a copy of the recovery key offline; enable multi-factor authentication on your account. Device/session management and MFA setup are not yet integrated here.</p>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function StatusRow({ label, value, warning }: { label: string; value: string; warning: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <dt className="text-sm text-slate-300">{label}</dt>
      <dd className={`text-sm font-semibold ${warning ? "text-amber-300" : "text-emerald-300"}`}>{value}</dd>
    </div>
  );
}
