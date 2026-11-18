"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import { toPasswordVaultItem } from "@/lib/vault";

function PasswordDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { session } = useVault();
  const [notice, setNotice] = useState("");

  if (!session) {
    return (
      <AppShell title="Password details" activePath="/passwords">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm text-slate-400">Unlock the vault before viewing this credential.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/passwords" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
              <ArrowLeft className="h-4 w-4" /> Back to Passwords
            </Link>
            <Link href="/master-password" className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">
            Unlock vault
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const vaultItem = session.records.find((item) => item.id === id);
  const record = vaultItem ? toPasswordVaultItem(vaultItem) : null;
  if (!record) {
    return (
      <AppShell title="Password details" activePath="/passwords">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold text-white">Credential not found</h2>
          <Link href="/passwords" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
            <ArrowLeft className="h-4 w-4" /> Back to Passwords
          </Link>
        </div>
      </AppShell>
    );
  }

  const safeUrl = (() => {
    try {
      const url = new URL(record.url);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  })();

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(record.password);
      setNotice("Password copied to the clipboard. Clear it when you are finished.");
    } catch {
      setNotice("Clipboard access failed. Reveal the password and copy it manually.");
    }
  };

  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(record.username);
      setNotice("Username copied to the clipboard.");
    } catch {
      setNotice("Clipboard access failed. Copy the username manually.");
    }
  };

  return (
    <AppShell title="Password details" activePath="/passwords">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Decrypted locally</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">{record.site}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/passwords" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-600">
              <ArrowLeft className="h-4 w-4" /> Back to Passwords
            </Link>
            <button type="button" onClick={() => void copyPassword()} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
              Copy password
            </button>
            <button type="button" onClick={() => void copyUsername()} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600">
              Copy username
            </button>
          </div>
        </div>

        {notice && <p role="status" className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-sm text-blue-200">{notice}</p>}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Credential information</p>
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-sm text-slate-400">Website</p>
                <p className="mt-1 text-lg font-medium text-white">{record.site}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">URL</p>
                {safeUrl
                  ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all text-base text-blue-300 hover:text-blue-200">{record.url}</a>
                  : <p className="mt-1 break-all text-base text-white">{record.url || "Not set"}</p>}
              </div>
              <div>
                <p className="text-sm text-slate-400">Username</p>
                <p className="mt-1 break-all text-base text-white">{record.username || "Not set"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Email</p>
                <p className="mt-1 break-all text-base text-white">{record.email || "Not set"}</p>
              </div>
              <div>
                <p className="mb-2 text-sm text-slate-400">Password</p>
                <details className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-blue-300 hover:text-blue-200">
                    Reveal password
                  </summary>
                  <div className="mt-3 break-all font-mono text-sm text-white">{record.password}</div>
                </details>
              </div>
              <div>
                <p className="text-sm text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-200">{record.note || "No notes"}</p>
              </div>
              {(record.passwordHistory?.length ?? 0) > 0 && (
                <details className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-blue-300">Password history ({record.passwordHistory?.length})</summary>
                  <ol className="mt-3 space-y-3">
                    {record.passwordHistory?.map((entry, index) => (
                      <li key={`${entry.changedAt}-${index}`} className="border-t border-slate-800 pt-3">
                        <time className="text-xs text-slate-400">{entry.changedAt}</time>
                        <p className="mt-1 break-all font-mono text-sm text-white">{entry.password}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Encrypted metadata</p>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <span>Folder</span><span className="text-white">{record.folder}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <span>Strength</span><span className="text-emerald-300">{record.strength}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <span>Created</span><span className="text-white">{record.created}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <span>Updated</span><span className="text-white">{record.updated}</span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tags</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {record.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200">
                    #{tag}
                  </span>
                ))}
                {record.tags.length === 0 && <span className="text-sm text-slate-400">No tags</span>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

export default function PasswordDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Password details" activePath="/passwords">
          <p role="status" className="text-sm text-slate-400">Loading credential...</p>
        </AppShell>
      }
    >
      <PasswordDetailContent />
    </Suspense>
  );
}
