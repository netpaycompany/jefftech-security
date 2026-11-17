"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Images, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type PromptState = "checking" | "hidden" | "visible";
type UserLookupResult = {
  data: { user: { id: string } | null };
  error: { message: string } | null;
};

const promptKey = (userId: string) => `jefftech.photos-access-prompt.v1:${userId}`;

export function PhotoAccessPrompt() {
  const router = useRouter();
  const [promptState, setPromptState] = useState<PromptState>("checking");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void createClient().auth.getUser()
      .then((result: UserLookupResult) => {
        if (!active) return;
        if (result.error) {
          setError("We couldn't check your photo-access preference. You can still open Photos from the navigation.");
          setPromptState("hidden");
          return;
        }
        if (!result.data.user) {
          setPromptState("hidden");
          return;
        }

        setUserId(result.data.user.id);
        try {
          setPromptState(localStorage.getItem(promptKey(result.data.user.id)) ? "hidden" : "visible");
        } catch {
          setPromptState("visible");
        }
      })
      .catch(() => {
        if (active) {
          setError("We couldn't check your photo-access preference. You can still open Photos from the navigation.");
          setPromptState("hidden");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const rememberChoice = (choice: "allowed" | "dismissed") => {
    if (userId) {
      try {
        localStorage.setItem(promptKey(userId), choice);
      } catch {
        setError("Your choice couldn't be saved in this browser, so this prompt may appear again.");
      }
    }

    setPromptState("hidden");
    if (choice === "allowed") router.push("/photos");
  };

  return (
    <>
      {error && <p role="status" className="sr-only">{error}</p>}
      {promptState === "visible" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-access-title"
            aria-describedby="photo-access-description"
            className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
              <Images className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 id="photo-access-title" className="mt-5 text-xl font-semibold text-white">
              Use your private Photos space?
            </h2>
            <p id="photo-access-description" className="mt-3 text-sm leading-6 text-slate-300">
              Jefftech can help you keep selected images in your private photo library. Your browser does not grant websites blanket access to your photo library: you choose which files or folder to add, and only those selections are used.
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-400">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              Images are encrypted in this browser. You can skip this and use Photos later from the navigation.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => rememberChoice("dismissed")}>
                Not now
              </Button>
              <Button type="button" onClick={() => rememberChoice("allowed")}>
                Continue to Photos
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
