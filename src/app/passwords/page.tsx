"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, KeyRound, Search, ShieldAlert, Star } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import {
  createPasswordRecordContent,
  deleteEncryptedPasswordRecord,
  loadEncryptedVaultRecords,
  saveEncryptedPasswordRecord,
  toPasswordVaultItem,
  VaultConflictError,
  type PasswordVaultItem,
  type VaultItem,
} from "@/lib/vault";

const emptyForm = {
  site: "",
  username: "",
  email: "",
  password: "",
  url: "",
  folder: "General",
  note: "",
  tags: "",
};

function UnlockedPasswords() {
  const { session, setRecords } = useVault();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PasswordVaultItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "created">("updated");
  const [quickFilter, setQuickFilter] = useState<"all" | "favorites" | "recent" | "weak" | "reused">("all");
  const [recentCutoff, setRecentCutoff] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const allRecords = session?.records ?? [];
  const records = allRecords
    .map(toPasswordVaultItem)
    .filter((record) => record !== null);
  const folders = useMemo(() => [...new Set(records.map((record) => record.folder))].sort(), [records]);
  const tags = useMemo(() => [...new Set(records.flatMap((record) => record.tags))].sort(), [records]);
  const reusedPasswordIds = useMemo(() => {
    const recordsByPassword = new Map<string, string[]>();
    for (const record of records) {
      const ids = recordsByPassword.get(record.password) ?? [];
      ids.push(record.id);
      recordsByPassword.set(record.password, ids);
    }
    return new Set([...recordsByPassword.values()].filter((ids) => ids.length > 1).flat());
  }, [records]);
  const recentCount = recentCutoff
    ? records.filter((record) => record.updated >= recentCutoff).length
    : null;
  const filteredRecords = useMemo(() => records
    .filter((record) => folderFilter === "all" || record.folder === folderFilter)
    .filter((record) => tagFilter === "all" || record.tags.includes(tagFilter))
    .filter((record) => quickFilter !== "favorites" || record.favorite)
    .filter((record) => quickFilter !== "recent" || Boolean(recentCutoff) && record.updated >= recentCutoff)
    .filter((record) => quickFilter !== "weak" || record.strength === "Weak")
    .filter((record) => quickFilter !== "reused" || reusedPasswordIds.has(record.id))
    .filter((record) => `${record.site} ${record.username} ${record.email} ${record.url} ${record.note} ${record.folder} ${record.tags.join(" ")}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sortBy === "name"
      ? left.site.localeCompare(right.site)
      : String(right[sortBy]).localeCompare(String(left[sortBy]))),
  [records, folderFilter, tagFilter, quickFilter, recentCutoff, reusedPasswordIds, query, sortBy]);

  if (!session) {
    return null;
  }

  const closeForm = () => {
    setShowForm(false);
    setEditingRecord(null);
    setForm(emptyForm);
    setError("");
  };

  const openNewForm = () => {
    setEditingRecord(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!form.password) {
      setError("Enter a password before saving this credential.");
      return;
    }

    setIsSubmitting(true);
    try {
      const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const content = createPasswordRecordContent({
        site: form.site.trim() || "Untitled entry",
        username: form.username,
        email: form.email,
        password: form.password,
        url: form.url,
        folder: form.folder.trim() || "General",
        note: form.note,
        tags,
      }, editingRecord ?? undefined);
      const id = editingRecord?.id ?? crypto.randomUUID();
      const revision = await saveEncryptedPasswordRecord(
        content,
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
        id,
        editingRecord?.revision ?? null,
      );
      const savedRecord: VaultItem = { id, revision, itemType: "password", content };
      setRecords(editingRecord
        ? allRecords.map((record) => record.id === id ? savedRecord : record)
        : [savedRecord, ...allRecords]);
      closeForm();
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          const latest = await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key);
          setRecords(latest);
          const latestItem = latest.find((item) => item.id === editingRecord?.id);
          const latestPassword = latestItem ? toPasswordVaultItem(latestItem) : null;
          if (latestPassword) setEditingRecord(latestPassword);
          setError(latestPassword
            ? "This credential changed on another device. The latest copy is loaded; review your unsaved changes and choose Save again to keep this form."
            : "This credential changed or was removed on another device. The latest vault has been loaded; review before continuing.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the encrypted credential.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (record: PasswordVaultItem) => {
    setEditingRecord(record);
    setForm({
      site: record.site,
      username: record.username,
      email: record.email,
      password: record.password,
      url: record.url,
      folder: record.folder,
      note: record.note,
      tags: record.tags.join(", "),
    });
    setError("");
    setShowForm(true);
  };

  const handleDelete = async (record: PasswordVaultItem) => {
    setError("");
    try {
      await deleteEncryptedPasswordRecord(session.vaultId, record.id, record.revision);
      setRecords(allRecords.filter((item) => item.id !== record.id));
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          setRecords(await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key));
          setError("This credential changed on another device. The latest vault is loaded; review it before deleting.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete the encrypted credential.");
    }
  };

  const copyToClipboard = async (value: string, label: string) => {
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied. Clear the clipboard when finished.`);
    } catch {
      setError(`Could not copy the ${label.toLowerCase()}. Check browser clipboard permissions.`);
    }
  };

  const toggleFavorite = async (record: PasswordVaultItem) => {
    setError("");
    const { id, revision, ...content } = record;
    const updatedContent = { ...content, favorite: !record.favorite, updated: new Date().toISOString().slice(0, 10) };
    try {
      const nextRevision = await saveEncryptedPasswordRecord(
        updatedContent,
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
        id,
        revision,
      );
      setRecords(allRecords.map((item) => item.id === id
        ? { id, revision: nextRevision, itemType: "password", content: updatedContent }
        : item));
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          setRecords(await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key));
          setError("This favorite changed on another device. The latest vault is loaded; review it and try again.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update favorite.");
    }
  };

  return (
    <AppShell title="Passwords" activePath="/passwords">
      <Link href="/vault" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/10">
        <ArrowLeft className="h-4 w-4" />
        Back to Vault Items
      </Link>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/70 to-slate-950 p-4 sm:mb-5 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300"><KeyRound className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">Passwords</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">Credentials are encrypted in your browser before they are sent to Supabase.</p>
          </div>
        </div>
        <button type="button" onClick={openNewForm} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-cyan-400 hover:to-blue-500">
          + Add Password
        </button>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-sm text-blue-200">{notice}</p>}
      <section aria-label="Search and filter passwords" className="mb-4 space-y-3 sm:mb-5">
        <div className="flex gap-2">
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-blue-400/40 bg-gradient-to-r from-blue-950/70 to-slate-950 px-3.5 py-3 focus-within:border-blue-300">
            <Search className="h-5 w-5 shrink-0 text-blue-200" />
            <span className="sr-only">Search credentials</span>
            <input id="password-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search passwords..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-300" />
          </label>
          <details className="relative">
            <summary aria-label="More password filters" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-2xl border border-blue-400/40 bg-slate-950 text-blue-200 [&::-webkit-details-marker]:hidden">
              <ShieldAlert className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-60 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
              <label className="block text-xs text-slate-300">
                Folder
                <select aria-label="Filter by folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                  <option value="all">All folders</option>
                  {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-300">
                Tag
                <select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                  <option value="all">All tags</option>
                  {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-300">
                Sort by
                <select aria-label="Sort credentials" value={sortBy} onChange={(event) => setSortBy(event.target.value as "updated" | "name" | "created")} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                  <option value="updated">Recently updated</option>
                  <option value="created">Recently created</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          </details>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { value: "all", label: `All (${records.length})` },
            { value: "favorites", label: `Favorites (${records.filter((record) => record.favorite).length})` },
            { value: "recent", label: recentCount === null ? "Recent" : `Recent (${recentCount})` },
            { value: "weak", label: `Weak (${records.filter((record) => record.strength === "Weak").length})` },
            { value: "reused", label: `Reused (${reusedPasswordIds.size})` },
          ].map(({ value, label }) => (
            <button key={value} type="button" onClick={() => {
              if (value === "recent") {
                setRecentCutoff(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
              }
              setQuickFilter(value as typeof quickFilter);
            }} aria-pressed={quickFilter === value} className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-xs font-medium sm:text-sm ${quickFilter === value ? "border-cyan-300/60 bg-gradient-to-r from-cyan-500 to-blue-600 text-white" : "border-blue-400/35 bg-slate-950/70 text-slate-200 hover:bg-blue-500/10"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Saved passwords" className="space-y-2 sm:space-y-3">
        {filteredRecords.map((record) => (
          <article key={record.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-3 sm:min-h-[84px] sm:gap-4 sm:px-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300"><KeyRound className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white sm:text-base">{record.site || "Untitled entry"}</p>
              <p className="mt-0.5 truncate text-xs text-slate-300">{record.username || record.email || "No username"} · {record.folder}</p>
              {record.tags.length > 0 && <p className="mt-1 truncate text-[10px] text-blue-200">{record.tags.map((tag) => `#${tag}`).join(" ")}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${record.strength === "Strong" ? "bg-emerald-500/10 text-emerald-300" : record.strength === "Medium" ? "bg-amber-500/10 text-amber-200" : "bg-red-500/10 text-red-200"}`}>
              {record.strength}
            </span>
            <button type="button" onClick={() => void toggleFavorite(record)} aria-label={record.favorite ? "Remove from favorites" : "Add to favorites"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/10">
              <Star className={`h-5 w-5 ${record.favorite ? "fill-current" : ""}`} />
            </button>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <button type="button" onClick={() => void copyToClipboard(record.password, "Password")} className="rounded-lg border border-blue-400/40 px-2.5 py-2 text-xs text-blue-100">Copy</button>
              <button type="button" onClick={() => setRevealedPasswords((current) => {
                const next = new Set(current);
                if (next.has(record.id)) next.delete(record.id);
                else next.add(record.id);
                return next;
              })} className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-200">
                {revealedPasswords.has(record.id) ? record.password : "Reveal"}
              </button>
              <Link href={`/passwords/${record.id}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-400/40 px-2.5 py-2 text-xs text-blue-100">
                Open <ChevronRight className="h-4 w-4" />
              </Link>
              <button type="button" onClick={() => handleEdit(record)} className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-200">Edit</button>
              <button type="button" onClick={() => void handleDelete(record)} className="rounded-lg border border-red-500/40 px-2.5 py-2 text-xs text-red-200">Delete</button>
            </div>
          </article>
        ))}
        {filteredRecords.length === 0 && (
          <p className="rounded-2xl border border-dashed border-blue-300/40 bg-slate-950/40 p-8 text-center text-sm text-slate-300">
            {records.length === 0 ? "Your encrypted vault is empty. Add a password to begin." : "No passwords match these filters."}
          </p>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="my-auto w-full max-w-2xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-blue-950/30">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Encrypted vault entry</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {editingRecord ? "Edit credential" : "Add credential"}
                </h3>
              </div>
              <button type="button" onClick={closeForm} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200">
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Website name
                <input value={form.site} onChange={(event) => setForm((current) => ({ ...current, site: event.target.value }))} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                Folder
                <input value={form.folder} onChange={(event) => setForm((current) => ({ ...current, folder: event.target.value }))} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                Username
                <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                Email
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Website URL
                <input type="url" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Password
                <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Notes
                <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} autoComplete="off" className="mt-2 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Tags
                <input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} autoComplete="off" placeholder="work, finance, team" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeForm} disabled={isSubmitting} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {isSubmitting ? "Encrypting and saving..." : editingRecord ? "Save changes" : "Create credential"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

export default function PasswordsPage() {
  const { session } = useVault();
  if (!session) {
    return (
      <AppShell title="Passwords" activePath="/passwords">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Unlock it with your master password before viewing or editing credentials.</p>
          <Link href="/master-password" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">
            Unlock vault
          </Link>
        </div>
      </AppShell>
    );
  }
  return <UnlockedPasswords />;
}
