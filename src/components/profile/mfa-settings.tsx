"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Fingerprint, LoaderCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthenticatorFactor = {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: string;
};

type TotpSetup = {
  id: string;
  qrCode: string;
  secret: string;
};

export function MfaSettings() {
  const [factors, setFactors] = useState<AuthenticatorFactor[]>([]);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedFactors, setHasLoadedFactors] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadFactors = async () => {
    const { data: { user }, error: userError } = await createClient().auth.getUser();
    if (userError) throw new Error(`Unable to verify your Jefftech account: ${userError.message}`);
    if (!user) throw new Error("Sign in again to manage two-factor authentication.");
    const { data, error: factorError } = await createClient().auth.mfa.listFactors();
    if (factorError) throw new Error(`Unable to load your authenticator settings: ${factorError.message}`);
    const list = data.all.map((factor: AuthenticatorFactor) => ({
      id: factor.id,
      friendly_name: factor.friendly_name ?? null,
      factor_type: factor.factor_type,
      status: factor.status,
    }));
    setFactors(list);
    setHasLoadedFactors(true);
  };

  useEffect(() => {
    let active = true;
    const timerId = window.setTimeout(() => {
      void loadFactors().catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load two-factor authentication.");
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, []);

  const beginSetup = async () => {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const client = createClient();
      for (const factor of factors.filter((item) => item.status !== "verified")) {
        const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw new Error(`Unable to replace an unfinished authenticator: ${removeError.message}`);
      }
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Jefftech Security authenticator",
      });
      if (enrollError) throw new Error(`Unable to start authenticator setup: ${enrollError.message}`);
      setSetup({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start authenticator setup.");
    } finally {
      setIsBusy(false);
    }
  };

  const verifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || !/^\d{6}$/.test(code.trim())) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const client = createClient();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: setup.id });
      if (challengeError) throw new Error(`Unable to verify the authenticator code: ${challengeError.message}`);
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId: setup.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(`The authenticator code was not accepted: ${verifyError.message}`);
      setSetup(null);
      setCode("");
      await loadFactors();
      const { error: auditError } = await client.rpc("record_security_event", {
        p_event_type: "mfa_enabled",
        p_severity: "info",
      });
      setNotice(auditError
        ? `Two-factor authentication is enabled, but the security notification could not be recorded: ${auditError.message}`
        : "Two-factor authentication is enabled for your account.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to verify authenticator setup.");
    } finally {
      setIsBusy(false);
    }
  };

  const cancelSetup = async () => {
    if (!setup) return;
    setIsBusy(true);
    setError("");
    try {
      const { error: unenrollError } = await createClient().auth.mfa.unenroll({ factorId: setup.id });
      if (unenrollError) throw new Error(`Unable to cancel authenticator setup: ${unenrollError.message}`);
      setSetup(null);
      setCode("");
      await loadFactors();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to cancel authenticator setup.");
    } finally {
      setIsBusy(false);
    }
  };

  const disableMfa = async () => {
    const verifiedFactors = factors.filter((factor) => factor.status === "verified");
    if (verifiedFactors.length === 0) return;
    if (!window.confirm("Disable two-factor authentication? This removes the verified authenticator factors from your account.")) return;
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const client = createClient();
      for (const factor of verifiedFactors) {
        const { error: unenrollError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) throw new Error(`Unable to remove ${factor.friendly_name ?? "an authenticator"}: ${unenrollError.message}`);
      }
      await loadFactors();
      const { error: auditError } = await client.rpc("record_security_event", {
        p_event_type: "mfa_disabled",
        p_severity: "warning",
      });
      setNotice(auditError
        ? `Two-factor authentication is disabled, but the security notification could not be recorded: ${auditError.message}`
        : "Two-factor authentication is disabled for your account.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to disable two-factor authentication.");
      await loadFactors().catch((refreshError: unknown) => {
        setError(`${caughtError instanceof Error ? caughtError.message : "Unable to disable two-factor authentication."} Current status could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
      });
    } finally {
      setIsBusy(false);
    }
  };

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");
  const pendingFactors = factors.filter((factor) => factor.status !== "verified");

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Fingerprint className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-medium text-white">Two-factor authentication</p>
            <p className="text-xs text-slate-400">
              {isLoading ? "Checking account protection…" : verifiedFactors.length ? `${verifiedFactors.length} verified authenticator${verifiedFactors.length === 1 ? "" : "s"} active` : "Add a time-based authenticator for sign-in"}
            </p>
          </div>
        </div>
        {isLoading ? (
          <LoaderCircle className="h-5 w-5 animate-spin text-blue-300" aria-label="Loading" />
        ) : !hasLoadedFactors ? (
          <button type="button" disabled={isBusy} onClick={() => {
            setIsLoading(true);
            setError("");
            void loadFactors().catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Unable to load your authenticator settings.")).finally(() => setIsLoading(false));
          }} className="rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10 disabled:opacity-50">
            Retry status
          </button>
        ) : verifiedFactors.length ? (
          <button type="button" disabled={isBusy} onClick={() => void disableMfa()} className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/10 disabled:opacity-50">
            {isBusy ? "Updating…" : "Disable 2FA"}
          </button>
        ) : !setup ? (
          <button type="button" disabled={isBusy} onClick={() => void beginSetup()} className="rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10 disabled:opacity-50">
            Set up 2FA
          </button>
        ) : null}
      </div>

      {pendingFactors.length > 0 && !setup && (
        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">
          An unfinished authenticator setup exists. Start a new setup to replace the pending factor.
        </p>
      )}
      {setup && (
        <form onSubmit={verifySetup} className="mt-5 space-y-4 rounded-2xl border border-blue-500/25 bg-slate-950 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Connect an authenticator app</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Scan this code with an authenticator app, then enter its six-digit code to finish setup.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* Supabase returns a data URI for the TOTP QR code. */}
            <Image src={setup.qrCode} alt="Authenticator setup QR code" width={144} height={144} unoptimized className="h-36 w-36 rounded-lg bg-white p-2" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400">Manual setup key</p>
              <code className="mt-1 block break-all rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-sm text-cyan-200">{setup.secret}</code>
            </div>
          </div>
          <label htmlFor="mfa-setup-code" className="block text-sm text-slate-300">
            Verification code
            <input id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required className="mt-2 w-full max-w-xs rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-white" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isBusy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {isBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Verify and enable
            </button>
            <button type="button" disabled={isBusy} onClick={() => void cancelSetup()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50">Cancel setup</button>
          </div>
        </form>
      )}
      {verifiedFactors.map((factor) => (
        <p key={factor.id} className="mt-3 flex items-center gap-2 text-xs text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          {factor.friendly_name || (factor.factor_type === "totp" ? "Authenticator app" : factor.factor_type)} verified
        </p>
      ))}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
    </section>
  );
}
