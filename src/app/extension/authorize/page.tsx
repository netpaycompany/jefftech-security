"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type AuthorizationRequest = {
  codeChallenge: string;
  redirectUri: string;
};

export default function ExtensionAuthorizationPage() {
  const router = useRouter();
  const [request, setRequest] = useState<AuthorizationRequest | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const codeChallenge = params.get("code_challenge") ?? "";
    const codeChallengeMethod = params.get("code_challenge_method") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const state = params.get("state") ?? "";

    if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
      || !/^[A-Za-z0-9_-]{43}$/.test(state)
      || codeChallengeMethod !== "S256"
      || !redirectUri) {
      const timer = window.setTimeout(() => {
        if (active) {
          setError("The extension sent an invalid authorization request.");
          setIsLoading(false);
        }
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    const next = `${window.location.pathname}${window.location.search}`;
    void (async () => {
      const { data, error: authError } = await createClient().auth.getUser();
      if (!active) return;
      if (authError) {
        setError("Unable to verify your Jefftech account. Refresh the page and try again.");
      } else if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      } else {
        setEmail(data.user.email ?? "");
        setRequest({ codeChallenge, redirectUri });
      }
      setIsLoading(false);
    })().catch(() => {
      if (active) {
        setError("Unable to verify your Jefftech account. Refresh the page and try again.");
        setIsLoading(false);
      }
    });

    return () => { active = false; };
  }, [router]);

  const authorize = async () => {
    if (!request) return;
    setError("");
    setIsAuthorizing(true);
    try {
      const response = await fetch("/api/extension/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null
        || !("redirectUrl" in result) || typeof result.redirectUrl !== "string") {
        const message = typeof result === "object" && result !== null
          && "error" in result && typeof result.error === "string"
          ? result.error
          : "The extension could not be authorized.";
        throw new Error(message);
      }
      const callback = new URL(result.redirectUrl);
      const requestedCallback = new URL(request.redirectUri);
      if (callback.origin !== requestedCallback.origin || callback.pathname !== requestedCallback.pathname) {
        throw new Error("The extension returned an unexpected authorization destination.");
      }
      callback.searchParams.set("state", new URLSearchParams(window.location.search).get("state") ?? "");
      window.location.replace(callback.toString());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The extension could not be authorized.");
      setIsAuthorizing(false);
    }
  };

  const cancel = () => {
    const redirectUri = request?.redirectUri;
    const state = new URLSearchParams(window.location.search).get("state");
    if (!redirectUri || !state) {
      router.replace("/settings");
      return;
    }
    void fetch("/api/extension/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectUri, state }),
      cache: "no-store",
    }).then(async (response) => {
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null
        || !("redirectUrl" in result) || typeof result.redirectUrl !== "string") {
        throw new Error("The extension cancellation could not be completed.");
      }
      const callback = new URL(result.redirectUrl);
      const requestedCallback = new URL(redirectUri);
      if (callback.origin !== requestedCallback.origin || callback.pathname !== requestedCallback.pathname) {
        throw new Error("The extension returned an unexpected cancellation destination.");
      }
      window.location.replace(callback.toString());
    }).catch((caughtError: unknown) => {
      setError(caughtError instanceof Error ? caughtError.message : "The extension cancellation could not be completed.");
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-950/30">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Jefftech Security</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Connect browser extension</h1>
        {isLoading ? (
          <p className="mt-5 text-sm text-slate-400">Verifying your account…</p>
        ) : error && !request ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Authorize Jefftech Password Vault to access encrypted password records for
              {email ? <strong className="text-white"> {email}</strong> : " your account"}.
              The extension decrypts records on this device after you unlock your vault.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-400">
              <li>• It can read and update encrypted password records in your vault.</li>
              <li>• Your vault master password and decryption key are never sent to Jefftech.</li>
              <li>• You can revoke this extension session from Settings at any time.</li>
            </ul>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!request || isAuthorizing}
                onClick={() => void authorize()}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {isAuthorizing ? "Connecting…" : "Authorize extension"}
              </button>
              <button
                type="button"
                disabled={isAuthorizing}
                onClick={cancel}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
