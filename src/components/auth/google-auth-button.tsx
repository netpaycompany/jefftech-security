"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const GOOGLE_SIGNUP_DRAFT_KEY = "jefftech.google-signup";

type Props = {
  redirectPath: string;
  disabled?: boolean;
  beforeRedirect?: () => string | null;
};

export function saveGoogleSignupDraft(referralCode: string) {
  sessionStorage.setItem(GOOGLE_SIGNUP_DRAFT_KEY, JSON.stringify({
    referralCode,
  }));
}

export function discardGoogleSignupDraft() {
  try {
    sessionStorage.removeItem(GOOGLE_SIGNUP_DRAFT_KEY);
  } catch {
    return;
  }
}

export function takeGoogleSignupDraft() {
  const raw = sessionStorage.getItem(GOOGLE_SIGNUP_DRAFT_KEY);
  sessionStorage.removeItem(GOOGLE_SIGNUP_DRAFT_KEY);
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const draft = value as Record<string, unknown>;
    if (typeof draft.referralCode !== "string") return null;
    return {
      referralCode: draft.referralCode.slice(0, 64),
    };
  } catch {
    return null;
  }
}

export function GoogleAuthButton({ redirectPath, disabled = false, beforeRedirect }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setError("");
    const validationError = beforeRedirect?.();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", redirectPath);
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) throw oauthError;
    } catch (caughtError) {
      if (redirectPath.startsWith("/auth/google-complete")) {
        discardGoogleSignupDraft();
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start Google sign-in.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={disabled || isLoading || !isSupabaseConfigured()}
        onClick={() => void handleClick()}
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="mr-3 h-5 w-5">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94a11.05 11.05 0 0 1-4.8 7.24l7.73 6C44.38 38.01 46.98 31.7 46.98 24.55Z" />
          <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.2a23.9 23.9 0 0 0 0 21.58l7.98-6.2Z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48Z" />
        </svg>
        {isLoading ? "Connecting to Google..." : "Continue with Google"}
      </Button>
      {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
    </div>
  );
}
