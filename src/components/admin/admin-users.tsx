"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Account = {
  id: string;
  email: string | null;
  full_name: string | null;
  email_verified: boolean;
  created_at: string;
  suspended: boolean;
};

export function AdminUsers() {
  const [users, setUsers] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [emailAccount, setEmailAccount] = useState<Account | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");

  const loadAccounts = async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json() as { users?: Account[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Could not load accounts.");
    return body.users ?? [];
  };

  useEffect(() => {
    void loadAccounts()
      .then(setUsers)
      .catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Could not load accounts."));
  }, []);

  const updateStatus = async (account: Account) => {
    const suspended = !account.suspended;
    if (!window.confirm(`${suspended ? "Suspend" : "Reactivate"} ${account.email ?? "this account"}?`)) return;
    setBusyId(account.id);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, suspended }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Account status update failed.");
      setUsers(await loadAccounts());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Account status update failed.");
    } finally {
      setBusyId("");
    }
  };

  const openEmailComposer = (account: Account) => {
    setEmailAccount(account);
    setEmailSubject("");
    setEmailMessage("");
    setEmailStatus("");
    setError("");
  };

  const sendNotification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailAccount) return;
    setEmailBusy(true);
    setError("");
    setEmailStatus("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: emailAccount.id,
          subject: emailSubject,
          message: emailMessage,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Notification could not be sent.");
      setEmailStatus(`Email sent to ${emailAccount.email}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Notification could not be sent.");
    } finally {
      setEmailBusy(false);
    }
  };

  const filtered = users.filter((account) => `${account.full_name ?? ""} ${account.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-blue-300">← Admin overview</Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Account management</h1>
        <p className="mt-2 text-sm text-slate-400">Showing up to 200 accounts. This view contains account metadata only; it cannot access vault keys or encrypted records.</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        {emailAccount && (
          <section aria-labelledby="admin-email-title" className="mt-6 rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/70 to-slate-900 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-300">Branded notification</p>
                <h2 id="admin-email-title" className="mt-2 text-xl font-semibold text-white">Email {emailAccount.full_name || "user"}</h2>
                <p className="mt-1 text-sm text-slate-300">To: {emailAccount.email}</p>
              </div>
              <button type="button" onClick={() => setEmailAccount(null)} disabled={emailBusy} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Close</button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <form onSubmit={(event) => void sendNotification(event)} className="space-y-4">
                <label className="block text-sm text-slate-300">
                  Subject
                  <input required maxLength={160} value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="block text-sm text-slate-300">
                  Message
                  <textarea required maxLength={10_000} rows={8} value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                  <span className="mt-1 block text-right text-xs text-slate-500">{emailMessage.length}/10,000</span>
                </label>
                <p className="text-xs leading-5 text-slate-400">This sends one email to the selected account. Never request a master password or recovery key.</p>
                {emailStatus && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{emailStatus}</p>}
                <button type="submit" disabled={emailBusy || !emailSubject.trim() || !emailMessage.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {emailBusy ? "Sending email…" : "Send notification email"}
                </button>
              </form>
              <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                <div className="border-b border-blue-900 bg-gradient-to-r from-blue-950 to-slate-900 p-4">
                  <div className="flex items-center gap-3">
                    <Image src="/logo.png" alt="Jefftech Security" width={48} height={48} className="rounded-lg bg-white object-contain" />
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.25em] text-blue-300">Jefftech Security</p>
                      <p className="mt-2 font-semibold text-white">A message for you</p>
                    </div>
                  </div>
                </div>
                <div className="min-h-36 p-4">
                  <p className="text-xs text-slate-500">Subject: <span className="text-slate-300">{emailSubject || "Your subject appears here"}</span></p>
                  <p className="mt-4 text-sm text-slate-300">Hello {emailAccount.full_name || "there"},</p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{emailMessage || "Your message preview appears here."}</p>
                  <a href="https://jefftechsecurity.vercel.app/login" className="mt-4 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Open Jefftech Security</a>
                </div>
                <p className="border-t border-slate-800 p-3 text-[11px] leading-5 text-slate-500">We will never ask you to email us your master password or recovery key.</p>
              </div>
            </div>
          </section>
        )}
        <label className="mt-5 block max-w-lg text-sm text-slate-300">Search accounts<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" /></label>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900 text-slate-400"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((account) => (
                <tr key={account.id}>
                  <td className="px-4 py-3"><p className="font-medium text-white">{account.full_name || "Unnamed account"}</p><p className="text-xs text-slate-500">{account.email}</p></td>
                  <td className="px-4 py-3 text-slate-300">{new Date(account.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-300">{account.email_verified ? "Verified" : "Unverified"}</td>
                  <td className="px-4 py-3 text-slate-300">{account.suspended ? "Suspended" : "Active"}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={!account.email || busyId === account.id} onClick={() => openEmailComposer(account)} className="rounded-lg border border-blue-500/40 px-3 py-1.5 text-xs text-blue-200 disabled:opacity-50">Email</button><button type="button" disabled={busyId === account.id} onClick={() => void updateStatus(account)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{account.suspended ? "Reactivate" : "Suspend"}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No matching accounts.</p>}
        </div>
      </div>
    </main>
  );
}
