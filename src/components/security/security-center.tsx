"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Fingerprint,
  Laptop,
  Layers3,
  LockKeyhole,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProfileSectionPage } from "@/components/profile/profile-section-page";
import { useVault } from "@/components/vault/vault-provider";
import { VAULT_ALGORITHM } from "@/lib/security";
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

export function SecurityCenter({ profileMode = false }: { profileMode?: boolean }) {
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
  const breachMatches = Object.values(breachResults).filter((value) => value === "found").length;
  const breachChecksComplete = passwords.length > 0 && Object.keys(breachResults).length === passwords.length;
  const needsAttention = weak.length > 0 || reused.size > 0 || breachMatches > 0;
  const securityStatus = !session
    ? "Vault locked"
    : passwords.length === 0
      ? "Ready to monitor"
      : needsAttention ? "Needs attention" : "No weaknesses found";
  const securitySummary = needsAttention
    ? "Review the password-health findings below."
    : passwords.length === 0
      ? "Your encrypted vault is ready for password-health checks."
      : breachChecksComplete
        ? "No weak, reused, or known-breached passwords were found."
        : Object.keys(breachResults).length === 0
          ? "No weak or reused passwords; the optional breach check has not run."
          : "No weak or reused passwords; the breach check is incomplete.";
  const breachCheckValue = passwords.length === 0
    ? "Not checked"
    : Object.keys(breachResults).length === 0
      ? "Not checked"
      : breachChecksComplete
        ? String(breachMatches)
        : `${Object.keys(breachResults).length}/${passwords.length} checked`;

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

  const content = (
    <>
      {!session ? (
        <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/70 to-slate-950 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-white">Vault is locked</p>
              <p className="text-xs text-slate-300">Unlock to run private password-health checks.</p>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white">Unlock to analyze your vault</h2>
          <p className="mt-2 text-sm text-slate-400">Weak and reused password analysis runs locally against decrypted records.</p>
          <Link href="/master-password" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white">Unlock vault</Link>
        </section>
      ) : (
        <div>
          <p className="mb-4 text-sm text-slate-300 sm:mb-5 sm:text-base">Monitor your vault, protect your data, and stay secure.</p>

          <section className="mb-4 flex min-h-32 items-center justify-between gap-4 overflow-hidden rounded-3xl border border-cyan-400/35 bg-gradient-to-r from-blue-950 via-slate-950 to-blue-950 p-4 sm:mb-5 sm:p-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              <ShieldCheck className={`h-12 w-12 shrink-0 sm:h-16 sm:w-16 ${needsAttention ? "text-amber-300" : "text-emerald-400"}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white sm:text-lg">Security Status</p>
                <h2 className={`mt-1 text-2xl font-bold sm:text-3xl ${needsAttention ? "text-amber-300" : "text-emerald-300"}`}>{securityStatus}</h2>
                <p className="mt-1 text-xs text-slate-300 sm:text-sm">{securitySummary} The vault stays unlocked in this tab until you lock it, sign out, or close the tab.</p>
              </div>
            </div>
            <span aria-hidden="true" className="hidden h-24 w-24 shrink-0 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-300 sm:flex">
              <LockKeyhole className="h-12 w-12" />
            </span>
          </section>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Encryption", value: VAULT_ALGORITHM, icon: LockKeyhole, color: "text-cyan-300" },
              { label: "Weak passwords", value: String(weak.length), icon: ShieldAlert, color: weak.length ? "text-amber-300" : "text-emerald-300" },
              { label: "Reused passwords", value: String(reused.size), icon: Fingerprint, color: reused.size ? "text-amber-300" : "text-emerald-300" },
              { label: "Breach matches", value: breachCheckValue, icon: Layers3, color: breachMatches ? "text-amber-300" : "text-blue-200" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/80 to-slate-950 p-3 text-center sm:min-h-32">
                <Icon className={`mb-2 h-7 w-7 ${color}`} />
                <p className="text-xs font-semibold text-white sm:text-sm">{label}</p>
                <p className={`mt-1 text-xs font-medium ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <nav aria-label="Security tools" className="mb-5 space-y-2">
            {[
              { title: "Password Alerts", description: "Review weak or reused password findings", href: "#password-health", icon: Bell, color: "text-sky-300 bg-blue-500/20" },
              { title: "Devices & Sessions", description: "Manage devices currently signed in", href: profileMode ? "/profile/my-devices" : "/devices", icon: Laptop, color: "text-cyan-300 bg-cyan-500/20" },
              { title: "Password Health", description: "Check for weak or reused passwords", href: "#password-health", icon: Shield, color: "text-sky-300 bg-blue-500/20" },
              { title: "Breach Check", description: "Optional private check against known breaches", href: "#breach-check", icon: Fingerprint, color: "text-teal-300 bg-teal-500/20" },
              { title: "Security Settings", description: "Manage vault encryption and extension sessions", href: profileMode ? "/profile/security-settings" : "/settings", icon: LockKeyhole, color: "text-violet-300 bg-violet-500/20" },
            ].map(({ title, description, href, icon: Icon, color }) => (
              <Link key={title} href={href} className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/65 to-slate-950 px-3 py-3 transition-colors hover:border-blue-400/60 sm:min-h-[76px] sm:gap-4 sm:px-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${color}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white sm:text-base">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-300 sm:text-sm">{description}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </nav>

          <div className="grid gap-4 xl:grid-cols-2">
            <section id="password-health" className="scroll-mt-5 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Local password analysis</p>
                  <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">{passwords.length} saved passwords</h2>
                </div>
                <ShieldAlert className="h-5 w-5 text-amber-300" />
              </div>
              <dl className="space-y-2">
                <StatusRow label="Weak passwords" value={String(weak.length)} warning={weak.length > 0} />
                <StatusRow label="Reused passwords" value={String(reused.size)} warning={reused.size > 0} />
                <StatusRow label="Known breach matches" value={String(breachMatches)} warning={breachMatches > 0} />
              </dl>
              <ul className="mt-4 space-y-2 text-sm">
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

            <section id="breach-check" className="scroll-mt-5 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Privacy-preserving breach check</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                This optional check sends only the first five characters of each password&apos;s SHA-1 hash to Have I Been Pwned. The password and remaining hash suffix stay on this device. The service will still see your IP address and requested prefixes.
              </p>
              <button type="button" onClick={() => void runBreachChecks()} disabled={isChecking || passwords.length === 0} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {isChecking ? "Checking..." : "Check breach status"}
              </button>
              {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
              <p className="mt-4 text-xs leading-5 text-slate-400">Use unique, long passwords and keep a copy of your recovery key offline. This check is optional and runs only when you start it.</p>
            </section>
          </div>
        </div>
      )}
    </>
  );

  return profileMode ? (
    <ProfileSectionPage title="Password Alerts" activeHref="/profile/password-alerts">{content}</ProfileSectionPage>
  ) : (
    <AppShell title="Security Center" activePath="/security">{content}</AppShell>
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
