"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

  const filtered = users.filter((account) => `${account.full_name ?? ""} ${account.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-blue-300">← Admin overview</Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Account management</h1>
        <p className="mt-2 text-sm text-slate-400">Showing up to 200 accounts. This view contains account metadata only; it cannot access vault keys or encrypted records.</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        <label className="mt-5 block max-w-lg text-sm text-slate-300">Search accounts<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" /></label>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900 text-slate-400"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Access</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((account) => (
                <tr key={account.id}>
                  <td className="px-4 py-3"><p className="font-medium text-white">{account.full_name || "Unnamed account"}</p><p className="text-xs text-slate-500">{account.email}</p></td>
                  <td className="px-4 py-3 text-slate-300">{new Date(account.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-300">{account.email_verified ? "Verified" : "Unverified"}</td>
                  <td className="px-4 py-3 text-slate-300">{account.suspended ? "Suspended" : "Active"}</td>
                  <td className="px-4 py-3"><button type="button" disabled={busyId === account.id} onClick={() => void updateStatus(account)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50">{account.suspended ? "Reactivate" : "Suspend"}</button></td>
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
