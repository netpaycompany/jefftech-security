"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Eye, KeyRound, LogOut, Search, ShieldCheck, Vault } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type VaultStatus = "Active" | "Needs review";
type VaultRecord = {
  id: string;
  name: string;
  owner: string;
  email: string;
  itemCount: number;
  keyVersion: string;
  created: string;
  lastUpdated: string;
  status: VaultStatus;
};

type StatusFilter = "All vaults" | VaultStatus;

const seedVaults: VaultRecord[] = [
  { id: "VLT-30941", name: "Primary Vault", owner: "Lena Martinez", email: "lena.martinez@example.com", itemCount: 84, keyVersion: "v3", created: "Aug 12, 2026", lastUpdated: "Nov 09, 2026", status: "Active" },
  { id: "VLT-30940", name: "Work Vault", owner: "Noah Bennett", email: "noah.bennett@example.com", itemCount: 126, keyVersion: "v3", created: "Jul 26, 2026", lastUpdated: "Nov 09, 2026", status: "Active" },
  { id: "VLT-30939", name: "Primary Vault", owner: "Priya Shah", email: "priya.shah@example.com", itemCount: 51, keyVersion: "v2", created: "Jul 18, 2026", lastUpdated: "Nov 08, 2026", status: "Needs review" },
  { id: "VLT-30938", name: "Family Vault", owner: "Ethan Brooks", email: "ethan.brooks@example.com", itemCount: 39, keyVersion: "v3", created: "Jun 30, 2026", lastUpdated: "Nov 07, 2026", status: "Active" },
  { id: "VLT-30937", name: "Primary Vault", owner: "Maya Chen", email: "maya.chen@example.com", itemCount: 203, keyVersion: "v3", created: "Jun 14, 2026", lastUpdated: "Nov 07, 2026", status: "Active" },
  { id: "VLT-30936", name: "Personal Vault", owner: "Oliver James", email: "oliver.james@example.com", itemCount: 67, keyVersion: "v2", created: "May 29, 2026", lastUpdated: "Nov 06, 2026", status: "Active" },
  { id: "VLT-30935", name: "Primary Vault", owner: "Amara Okafor", email: "amara.okafor@example.com", itemCount: 92, keyVersion: "v3", created: "May 17, 2026", lastUpdated: "Nov 04, 2026", status: "Needs review" },
];

const statusFilters: StatusFilter[] = ["All vaults", "Active", "Needs review"];

export default function AdminVaultsPage() {
  const isAuthenticated =
    typeof window !== "undefined" && window.sessionStorage.getItem("jefftech-admin-session") === "true";

  if (!isAuthenticated) {
    return <AdminRedirect />;
  }

  return <VaultsContent />;
}

function VaultsContent() {
  const router = useRouter();
  const [vaults, setVaults] = useState(seedVaults);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All vaults");
  const [selectedVault, setSelectedVault] = useState<VaultRecord | null>(null);
  const [notice, setNotice] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredVaults = vaults.filter((vault) => {
    const matchesQuery = `${vault.id} ${vault.name} ${vault.owner} ${vault.email}`.toLowerCase().includes(normalizedQuery);
    const matchesStatus = statusFilter === "All vaults" || vault.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const reviewCount = vaults.filter((vault) => vault.status === "Needs review").length;
  const encryptedItemCount = vaults.reduce((total, vault) => total + vault.itemCount, 0);
  const currentKeyCount = vaults.filter((vault) => vault.keyVersion === "v3").length;

  const handleSignOut = () => {
    window.sessionStorage.removeItem("jefftech-admin-session");
    router.push("/admin/login");
  };

  const handleReviewToggle = (vault: VaultRecord) => {
    const nextStatus: VaultStatus = vault.status === "Active" ? "Needs review" : "Active";
    setVaults((currentVaults) =>
      currentVaults.map((currentVault) => currentVault.id === vault.id ? { ...currentVault, status: nextStatus } : currentVault),
    );
    setNotice(`${vault.id} marked ${nextStatus === "Active" ? "reviewed" : "for review"} in this demo.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/admin/vaults" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
              <Vault className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</span>
              <span className="block text-sm font-semibold text-white">ADMIN CONTROL CENTER</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              Admin overview
            </Link>
            <Link href="/admin/users" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              User management
            </Link>
            <Link href="/admin/transactions" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              Transactions
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Admin overview
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Vault operations</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Vault management</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Review vault metadata, encryption key versions, and activity without accessing vault contents.
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            Prototype mode: this inventory uses sample metadata in browser memory. Review flags are local demo state. Vault item contents and encryption keys are never displayed here.
          </p>
        </div>

        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Vaults" value={vaults.length.toString()} icon={<Vault className="h-4 w-4" />} />
          <SummaryMetric label="Encrypted items" value={encryptedItemCount.toLocaleString()} icon={<KeyRound className="h-4 w-4" />} />
          <SummaryMetric label="Current key version" value={`${currentKeyCount} / ${vaults.length}`} icon={<Check className="h-4 w-4" />} />
          <SummaryMetric label="Needs review" value={reviewCount.toString()} icon={<CircleAlert className="h-4 w-4" />} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search vault, owner, or ID"
                aria-label="Search vaults"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-400">
              Review status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
              >
                {statusFilters.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Vault</th>
                  <th scope="col" className="px-5 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-5 py-3 font-medium">Encrypted items</th>
                  <th scope="col" className="px-5 py-3 font-medium">Key version</th>
                  <th scope="col" className="px-5 py-3 font-medium">Last updated</th>
                  <th scope="col" className="px-5 py-3 font-medium">Review status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Management</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredVaults.map((vault) => (
                  <tr key={vault.id} className="align-middle hover:bg-slate-800/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{vault.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{vault.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-200">{vault.owner}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{vault.email}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{vault.itemCount}</td>
                    <td className="px-5 py-4">
                      <span className={vault.keyVersion === "v3"
                        ? "rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-300"
                        : "rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-xs text-amber-200"}
                      >
                        {vault.keyVersion}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{vault.lastUpdated}</td>
                    <td className="px-5 py-4">
                      <VaultStatusBadge status={vault.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedVault(vault)}
                          aria-label={`View metadata for ${vault.id}`}
                          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white"
                          title="View metadata"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewToggle(vault)}
                          className={vault.status === "Active"
                            ? "rounded-lg border border-amber-500/25 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
                            : "rounded-lg border border-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10"}
                        >
                          {vault.status === "Active" ? "Flag review" : "Mark reviewed"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredVaults.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">
                      No vaults match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filteredVaults.length} of {vaults.length} sample vaults
          </div>
        </section>
      </main>

      {selectedVault && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-details-title"
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Metadata only</p>
                <h2 id="vault-details-title" className="mt-2 text-xl font-semibold text-white">{selectedVault.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedVault.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedVault(null)} className="text-sm text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Metadata label="Owner" value={selectedVault.owner} />
              <Metadata label="Email" value={selectedVault.email} />
              <Metadata label="Encrypted items" value={selectedVault.itemCount.toString()} />
              <Metadata label="Key version" value={selectedVault.keyVersion} />
              <Metadata label="Created" value={selectedVault.created} />
              <Metadata label="Last updated" value={selectedVault.lastUpdated} />
            </dl>
            <p className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-100">
              Encrypted payloads and private keys are intentionally not available in the admin console.
            </p>
            <div className="mt-6 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedVault(null)}>Close details</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">{icon}</span>
    </div>
  );
}

function VaultStatusBadge({ status }: { status: VaultStatus }) {
  const style = status === "Active"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/25 bg-amber-500/10 text-amber-200";

  return <span className={`rounded-full border px-2.5 py-1 text-xs ${style}`}>{status}</span>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-200">{value}</dd>
    </div>
  );
}

function AdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 text-sm text-slate-300">
        Redirecting to admin login...
      </div>
    </div>
  );
}
