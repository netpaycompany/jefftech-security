"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const allRecords = session?.records ?? [];
  const records = allRecords
    .map(toPasswordVaultItem)
    .filter((record) => record !== null);
  const folders = useMemo(() => [...new Set(records.map((record) => record.folder))].sort(), [records]);
  const tags = useMemo(() => [...new Set(records.flatMap((record) => record.tags))].sort(), [records]);
  const filteredRecords = useMemo(() => records
    .filter((record) => folderFilter === "all" || record.folder === folderFilter)
    .filter((record) => tagFilter === "all" || record.tags.includes(tagFilter))
    .filter((record) => !favoritesOnly || record.favorite)
    .filter((record) => `${record.site} ${record.username} ${record.email} ${record.url} ${record.note} ${record.folder} ${record.tags.join(" ")}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sortBy === "name"
      ? left.site.localeCompare(right.site)
      : String(right[sortBy]).localeCompare(String(left[sortBy]))),
  [records, folderFilter, tagFilter, favoritesOnly, query, sortBy]);

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
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Client-encrypted vault</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Saved credentials</h2>
            <p className="mt-2 text-sm text-slate-400">
              Credentials are encrypted in your browser before they are sent to Supabase.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewForm}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Add secret
          </button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-sm text-blue-200">{notice}</p>}
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
          <label className="sr-only" htmlFor="password-search">Search credentials</label>
          <input id="password-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search credentials (local only)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
          <select aria-label="Filter by folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="all">All folders</option>
            {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
          </select>
          <select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="all">All tags</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <select aria-label="Sort credentials" value={sortBy} onChange={(event) => setSortBy(event.target.value as "updated" | "name" | "created")} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-4">
            <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} className="accent-blue-500" />
            Favorites only
          </label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-200">
            <thead className="bg-slate-950/80 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Folder</th>
                <th className="px-4 py-3 font-medium">Strength</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-950/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{record.site}</p>
                    <p className="text-xs text-slate-400">{record.url}</p>
                    <button type="button" onClick={() => void toggleFavorite(record)} aria-label={record.favorite ? "Remove from favorites" : "Add to favorites"} className="mt-1 text-amber-300">{record.favorite ? "★ Favorite" : "☆ Add favorite"}</button>
                  </td>
                  <td className="px-4 py-3">
                    <span>{record.username}</span>
                    <div className="mt-1 flex gap-2">
                      <button type="button" onClick={() => void copyToClipboard(record.username, "Username")} className="text-xs text-blue-300">Copy</button>
                      <button type="button" onClick={() => void copyToClipboard(record.password, "Password")} className="text-xs text-blue-300">Copy password</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">{record.folder}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                      {record.strength}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/passwords/${record.id}`}
                        className="inline-flex rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-500/20"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => setRevealedPasswords((current) => {
                          const next = new Set(current);
                          if (next.has(record.id)) next.delete(record.id);
                          else next.add(record.id);
                          return next;
                        })}
                        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200"
                      >
                        {revealedPasswords.has(record.id) ? record.password : "Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(record)}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    {records.length === 0 ? "Your encrypted vault is empty. Add a credential to begin." : "No credentials match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
