"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";

import { AppShell } from "@/components/app-shell";

type Account = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type EmailMessage = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  text_body: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  created_at: string;
};

type EmailThread = {
  id: string;
  contact_email: string;
  contact_name: string | null;
  subject: string;
  last_message_at: string;
  messages: EmailMessage[];
};

function deliveryLabel(email: EmailMessage) {
  if (email.direction === "inbound") return "User replied";
  if (email.opened_at) return "Seen";
  if (email.delivered_at) return "Delivered";
  if (email.status === "bounced") return "Bounced";
  if (email.status === "failed") return "Failed";
  if (email.status === "sent") return "Sent";
  return "Sending";
}

function deliveryClassName(email: EmailMessage) {
  if (email.opened_at || email.delivered_at) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (email.status === "bounced" || email.status === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

export function AdminNotifications() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [userId, setUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"compose" | "mailbox">("compose");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadMailbox = useCallback(async () => {
    const response = await fetch("/api/admin/notifications", { cache: "no-store" });
    const body = await response.json() as { threads?: EmailThread[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Could not load the email mailbox.");
    setThreads(body.threads ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }).then(async (response) => {
        const body = await response.json() as { users?: Account[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load accounts.");
        return (body.users ?? []).filter((account) => account.email);
      }),
      fetch("/api/admin/notifications", { cache: "no-store" }).then(async (response) => {
        const body = await response.json() as { threads?: EmailThread[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load the email mailbox.");
        return body.threads ?? [];
      }),
    ])
      .then(([loadedAccounts, loadedThreads]) => {
        if (active) {
          setAccounts(loadedAccounts);
          setUserId(loadedAccounts[0]?.id ?? "");
          setThreads(loadedThreads);
          setSelectedThreadId(loadedThreads[0]?.id ?? "");
        }
      })
      .catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Could not load accounts.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (activeTab !== "mailbox") return;
    const timer = window.setInterval(() => {
      void loadMailbox().catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : "Mailbox refresh failed.");
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadMailbox]);

  const selectedAccount = accounts.find((account) => account.id === userId);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);

  const sendNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccount) return;
    setIsSending(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject, message }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Notification could not be sent.");
      setStatus(`Email sent to ${selectedAccount.email}.`);
      setSubject("");
      setMessage("");
      await loadMailbox();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Notification could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThread) return;
    setIsSending(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread.id, message: replyMessage }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Reply could not be sent.");
      setStatus(`Reply sent to ${selectedThread.contact_email}.`);
      setReplyMessage("");
      await loadMailbox();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Reply could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AppShell title="Email Notifications" activePath="/admin/notifications" adminMode>
      <div className="mx-auto max-w-5xl">
        <p className="text-sm leading-6 text-slate-400">
          Send branded emails and view delivery/open events. Replies are not directed to the admin mailbox. Message contents are stored in the admin mailbox.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Open status is best-effort and may be affected by email privacy features. Replies appear after inbound email and webhook receiving are configured.
        </p>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        {status && <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{status}</p>}
        <div role="tablist" aria-label="Email management" className="mt-6 flex gap-2 border-b border-slate-800">
          <button type="button" role="tab" aria-selected={activeTab === "compose"} onClick={() => setActiveTab("compose")} className={`border-b-2 px-4 py-3 text-sm ${activeTab === "compose" ? "border-blue-400 text-blue-200" : "border-transparent text-slate-400"}`}>Compose</button>
          <button type="button" role="tab" aria-selected={activeTab === "mailbox"} onClick={() => setActiveTab("mailbox")} className={`border-b-2 px-4 py-3 text-sm ${activeTab === "mailbox" ? "border-blue-400 text-blue-200" : "border-transparent text-slate-400"}`}>Mailbox ({threads.length})</button>
        </div>
        {isLoading ? (
          <p role="status" className="mt-6 text-sm text-slate-400">Loading accounts…</p>
        ) : activeTab === "mailbox" ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
            <section aria-label="Email conversations" className="space-y-2">
              <button type="button" onClick={() => void loadMailbox().catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Mailbox refresh failed."))} className="mb-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Refresh mailbox</button>
              {threads.map((thread) => {
                const latestMessage = thread.messages[thread.messages.length - 1];
                return (
                  <button key={thread.id} type="button" onClick={() => setSelectedThreadId(thread.id)} className={`block w-full rounded-xl border p-3 text-left ${selectedThreadId === thread.id ? "border-blue-400/50 bg-blue-950/50" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}>
                    <span className="block truncate text-sm font-medium text-white">{thread.contact_name || thread.contact_email}</span>
                    <span className="mt-1 block truncate text-xs text-slate-400">{thread.subject}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {latestMessage ? (
                        <span className={`rounded-full border px-2 py-0.5 ${deliveryClassName(latestMessage)}`}>
                          {deliveryLabel(latestMessage)}
                        </span>
                      ) : "No messages"}
                      <time>{new Date(thread.last_message_at).toLocaleString()}</time>
                    </span>
                  </button>
                );
              })}
              {threads.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">No email conversations yet.</p>}
            </section>
            <section aria-label="Selected conversation" className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              {selectedThread ? (
                <>
                  <h2 className="font-semibold text-white">{selectedThread.subject}</h2>
                  <p className="mt-1 text-xs text-slate-400">{selectedThread.contact_name || "User"} · {selectedThread.contact_email}</p>
                  <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto">
                    {selectedThread.messages.map((email) => (
                      <article key={email.id} className={`rounded-xl border p-3 ${email.direction === "outbound" ? "ml-4 border-blue-900/70 bg-blue-950/30" : "mr-4 border-slate-700 bg-slate-950"}`}>
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-200">{email.direction === "inbound" ? "User reply" : "Jefftech Security"}</span>
                          <time className="text-slate-500">{new Date(email.created_at).toLocaleString()}</time>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className={`rounded-full border px-2 py-0.5 ${deliveryClassName(email)}`}>
                            {deliveryLabel(email)}
                          </span>
                          {email.direction === "outbound" && email.delivered_at && (
                            <time className="text-slate-500">Delivered {new Date(email.delivered_at).toLocaleString()}</time>
                          )}
                          {email.direction === "outbound" && email.opened_at && (
                            <time className="text-emerald-300">Seen {new Date(email.opened_at).toLocaleString()}</time>
                          )}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{email.text_body}</p>
                      </article>
                    ))}
                  </div>
                  <form onSubmit={(event) => void sendReply(event)} className="mt-5 space-y-3 border-t border-slate-800 pt-4">
                    <label className="block text-sm text-slate-300">Reply<textarea required maxLength={10_000} rows={5} value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
                    <button type="submit" disabled={isSending || !replyMessage.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSending ? "Sending reply…" : "Reply in thread"}</button>
                  </form>
                </>
              ) : <p className="text-sm text-slate-400">Select an email conversation to view and reply.</p>}
            </section>
          </div>
        ) : accounts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">No accounts with an email address are available.</p>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
            <form onSubmit={(event) => void sendNotification(event)} className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
              <label className="block text-sm text-slate-300">
                Recipient
                <select required value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.full_name || "Unnamed account"} — {account.email}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                Subject
                <input required maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="block text-sm text-slate-300">
                Message
                <textarea required maxLength={10_000} rows={10} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                <span className="mt-1 block text-right text-xs text-slate-500">{message.length}/10,000</span>
              </label>
              <p className="text-xs leading-5 text-slate-400">Never ask a user to send their master password or recovery key by email.</p>
              {status && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{status}</p>}
              <button type="submit" disabled={isSending || !subject.trim() || !message.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                {isSending ? "Sending email…" : "Send notification email"}
              </button>
            </form>

            <section aria-label="Email preview" className="h-fit overflow-hidden rounded-3xl border border-slate-700 bg-slate-950">
              <div className="border-b border-blue-900 bg-gradient-to-r from-blue-950 to-slate-900 p-5">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="Jefftech Security" width={56} height={56} className="rounded-xl bg-white object-contain" />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-blue-300">Jefftech Security</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">A message for you</h2>
                  </div>
                </div>
              </div>
              <div className="min-h-48 p-5">
                <p className="text-xs text-slate-500">Subject: <span className="text-slate-300">{subject || "Your subject appears here"}</span></p>
                <p className="mt-5 text-sm text-slate-300">Hello {selectedAccount?.full_name || "there"},</p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message || "Your message preview appears here."}</p>
                <a href="https://jefftechsecurity.vercel.app/login" className="mt-5 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Open Jefftech Security</a>
              </div>
              <p className="border-t border-slate-800 p-4 text-xs leading-5 text-slate-500">We will never ask you to email us your master password or recovery key.</p>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
