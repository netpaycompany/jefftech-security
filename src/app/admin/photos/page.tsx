"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, HardDrive, Images, LogOut, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type LibraryStatus = "Protected" | "Needs review";
type PhotoLibraryRecord = {
  id: string;
  owner: string;
  email: string;
  photoCount: number;
  storageMb: number;
  encryption: string;
  lastActivity: string;
  status: LibraryStatus;
};

type StatusFilter = "All libraries" | LibraryStatus;

const sampleLibraries: PhotoLibraryRecord[] = [
  { id: "LIB-73041", owner: "Lena Martinez", email: "lena.martinez@example.com", photoCount: 148, storageMb: 624, encryption: "AES-GCM · device key", lastActivity: "Nov 09, 2026", status: "Protected" },
  { id: "LIB-73040", owner: "Noah Bennett", email: "noah.bennett@example.com", photoCount: 86, storageMb: 391, encryption: "AES-GCM · device key", lastActivity: "Nov 08, 2026", status: "Protected" },
  { id: "LIB-73039", owner: "Priya Shah", email: "priya.shah@example.com", photoCount: 232, storageMb: 1084, encryption: "AES-GCM · device key", lastActivity: "Nov 07, 2026", status: "Needs review" },
  { id: "LIB-73038", owner: "Ethan Brooks", email: "ethan.brooks@example.com", photoCount: 64, storageMb: 278, encryption: "AES-GCM · device key", lastActivity: "Nov 06, 2026", status: "Protected" },
  { id: "LIB-73037", owner: "Maya Chen", email: "maya.chen@example.com", photoCount: 417, storageMb: 1902, encryption: "AES-GCM · device key", lastActivity: "Nov 05, 2026", status: "Protected" },
  { id: "LIB-73036", owner: "Oliver James", email: "oliver.james@example.com", photoCount: 39, storageMb: 171, encryption: "AES-GCM · device key", lastActivity: "Nov 03, 2026", status: "Needs review" },
];

const statusFilters: StatusFilter[] = ["All libraries", "Protected", "Needs review"];

export default function AdminPhotosPage() {
  const isAuthenticated =
    typeof window !== "undefined" && window.sessionStorage.getItem("jefftech-admin-session") === "true";

  if (!isAuthenticated) {
    return <AdminRedirect />;
  }

  return <PhotoManagementContent />;
}

function PhotoManagementContent() {
  const router = useRouter();
  const [libraries, setLibraries] = useState(sampleLibraries);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All libraries");
  const [notice, setNotice] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLibraries = libraries.filter((library) => {
    const matchesQuery = `${library.id} ${library.owner} ${library.email}`.toLowerCase().includes(normalizedQuery);
    const matchesStatus = statusFilter === "All libraries" || library.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const totalPhotos = libraries.reduce((total, library) => total + library.photoCount, 0);
  const totalStorage = libraries.reduce((total, library) => total + library.storageMb, 0);
  const flaggedCount = libraries.filter((library) => library.status === "Needs review").length;

  const handleSignOut = () => {
    window.sessionStorage.removeItem("jefftech-admin-session");
    router.push("/admin/login");
  };

  const handleReviewToggle = (library: PhotoLibraryRecord) => {
    const nextStatus: LibraryStatus = library.status === "Protected" ? "Needs review" : "Protected";
    setLibraries((currentLibraries) =>
      currentLibraries.map((currentLibrary) => currentLibrary.id === library.id
        ? { ...currentLibrary, status: nextStatus }
        : currentLibrary),
    );
    setNotice(`${library.id} marked ${nextStatus === "Protected" ? "reviewed" : "for review"} in this demo.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/admin/photos" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
              <Images className="h-5 w-5" />
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
        <div className="mb-6">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Admin overview
          </Link>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Privacy operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Photo management</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Monitor photo-library metadata and encryption posture without exposing private images.
          </p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 text-sm text-blue-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
          <p>
            Privacy boundary: user photos are encrypted and stored in each user’s browser. Admins cannot view, download, or delete photo contents. This dashboard currently displays sample metadata only.
          </p>
        </div>

        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Photo libraries" value={libraries.length.toString()} icon={<Images className="h-4 w-4" />} />
          <SummaryMetric label="Photos accounted for" value={totalPhotos.toLocaleString()} icon={<Check className="h-4 w-4" />} />
          <SummaryMetric label="Browser storage" value={formatStorage(totalStorage)} icon={<HardDrive className="h-4 w-4" />} />
          <SummaryMetric label="Needs review" value={flaggedCount.toString()} icon={<TriangleAlert className="h-4 w-4" />} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search owner or library ID"
                aria-label="Search photo libraries"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-400">
              Status
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
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Library</th>
                  <th scope="col" className="px-5 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-5 py-3 font-medium">Photo count</th>
                  <th scope="col" className="px-5 py-3 font-medium">Stored size</th>
                  <th scope="col" className="px-5 py-3 font-medium">Encryption</th>
                  <th scope="col" className="px-5 py-3 font-medium">Last activity</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLibraries.map((library) => (
                  <tr key={library.id} className="align-middle hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-blue-200">{library.id}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{library.owner}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{library.email}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{library.photoCount.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">{formatStorage(library.storageMb)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">{library.encryption}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{library.lastActivity}</td>
                    <td className="px-5 py-4"><StatusBadge status={library.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleReviewToggle(library)}
                        className={library.status === "Protected"
                          ? "rounded-lg border border-amber-500/25 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
                          : "rounded-lg border border-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10"}
                      >
                        {library.status === "Protected" ? "Flag review" : "Mark reviewed"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLibraries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">No libraries match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filteredLibraries.length} of {libraries.length} sample libraries
          </div>
        </section>
      </main>
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

function StatusBadge({ status }: { status: LibraryStatus }) {
  const style = status === "Protected"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/25 bg-amber-500/10 text-amber-200";

  return <span className={`rounded-full border px-2.5 py-1 text-xs ${style}`}>{status}</span>;
}

function formatStorage(sizeMb: number) {
  return sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;
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
