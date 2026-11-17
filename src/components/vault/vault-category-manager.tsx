"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import {
  deleteEncryptedPasswordRecord,
  loadEncryptedVaultRecords,
  saveEncryptedVaultItem,
  VaultConflictError,
  type VaultItem,
} from "@/lib/vault";

export type VaultFieldDefinition = {
  name: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  sensitive?: boolean;
  required?: boolean;
  type?: "text" | "email" | "url" | "date";
};

const COMMON_FIELDS: VaultFieldDefinition[] = [
  { name: "folder", label: "Folder", placeholder: "General" },
  { name: "tags", label: "Tags", placeholder: "Separate tags with commas" },
];

function displayCategoryTitle(record: VaultItem, fallback: string) {
  return String(
    record.content.title
    ?? record.content.name
    ?? record.content.site
    ?? record.content.softwareName
    ?? record.content.bankName
    ?? record.content.fullName
    ?? fallback,
  );
}

export function VaultCategoryManager({
  itemType,
  title,
  description,
  fields,
  activePath,
}: {
  itemType: string;
  title: string;
  description: string;
  fields: VaultFieldDefinition[];
  activePath: string;
}) {
  const { session, setRecords } = useVault();
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [editing, setEditing] = useState<VaultItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoryRecords = useMemo(
    () => session?.records.filter((item) => item.itemType === itemType) ?? [],
    [session?.records, itemType],
  );
  const folders = useMemo(
    () => [...new Set(categoryRecords.map((item) => String(item.content.folder ?? "General")))].sort(),
    [categoryRecords],
  );
  const filtered = useMemo(() => categoryRecords
    .filter((item) => folderFilter === "all" || item.content.folder === folderFilter)
    .filter((item) => JSON.stringify(item.content).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => {
      if (sortBy === "name") {
        return displayCategoryTitle(left, title).localeCompare(displayCategoryTitle(right, title));
      }
      if (sortBy === "created") {
        return String(right.content.created ?? "").localeCompare(String(left.content.created ?? ""));
      }
      if (sortBy === "favorite") {
        return Number(Boolean(right.content.favorite)) - Number(Boolean(left.content.favorite));
      }
      return String(right.content.updated ?? "").localeCompare(String(left.content.updated ?? ""));
    }), [categoryRecords, folderFilter, query, sortBy, title]);

  if (!session) {
    return (
      <AppShell title={title} activePath={activePath}>
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm text-slate-400">Unlock your vault to view or manage encrypted {title.toLowerCase()}.</p>
          <a href="/master-password" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">Unlock vault</a>
        </section>
      </AppShell>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm({ folder: "General", tags: "" });
    setVisibleFields(new Set());
    setError("");
  };

  const closeForm = () => {
    setEditing(null);
    setForm({});
    setVisibleFields(new Set());
    setError("");
  };

  const openEdit = (record: VaultItem) => {
    setEditing(record);
    const nextForm: Record<string, string> = {};
    for (const field of fields) {
      const value = field.name === "tags"
        ? Array.isArray(record.content.tags) ? record.content.tags.join(", ") : ""
        : String(record.content[field.name] ?? "");
      nextForm[field.name] = value;
    }
    nextForm.folder = String(record.content.folder ?? "General");
    nextForm.tags = Array.isArray(record.content.tags) ? record.content.tags.join(", ") : "";
    setForm(nextForm);
    setVisibleFields(new Set());
    setError("");
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const titleField = fields.find((field) => field.required);
    const recordTitle = String(form.title ?? form.name ?? form.site ?? form.softwareName ?? form.bankName ?? form.fullName ?? "").trim();
    if (!recordTitle && titleField && !form[titleField.name]?.trim()) {
      setError(`Enter ${titleField.label.toLowerCase()} before saving.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const content: Record<string, unknown> = {
        ...(editing?.content ?? {}),
        ...form,
        folder: form.folder?.trim() || "General",
        tags: (form.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        favorite: Boolean(editing?.content.favorite),
        created: editing?.content.created ?? now,
        updated: now,
      };
      delete content.tagsText;
      const id = editing?.id ?? crypto.randomUUID();
      const revision = await saveEncryptedVaultItem(
        content,
        itemType,
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
        id,
        editing?.revision ?? null,
      );
      const saved: VaultItem = { id, revision, itemType, content };
      setRecords(editing
        ? session.records.map((item) => item.id === id ? saved : item)
        : [saved, ...session.records]);
      closeForm();
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          const latest = await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key);
          setRecords(latest);
          const latestItem = latest.find((item) => item.id === editing?.id);
          if (latestItem) setEditing(latestItem);
          setError(latestItem
            ? "This item changed on another device. The latest copy is loaded; review your unsaved form and choose Save again to keep it."
            : "This item changed or was removed on another device. The latest vault has been loaded.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : `Unable to save ${title.toLowerCase()}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFavorite = async (record: VaultItem) => {
    setError("");
    const content = { ...record.content, favorite: !record.content.favorite, updated: new Date().toISOString() };
    try {
      const revision = await saveEncryptedVaultItem(
        content,
        itemType,
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
        record.id,
        record.revision,
      );
      setRecords(session.records.map((item) => item.id === record.id
        ? { ...record, content, revision }
        : item));
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          setRecords(await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key));
          setError("This item changed on another device. The latest vault is loaded; review it before retrying.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update favorite.");
    }
  };

  const remove = async (record: VaultItem) => {
    if (!window.confirm("Delete this encrypted item permanently?")) {
      return;
    }
    setError("");
    try {
      await deleteEncryptedPasswordRecord(session.vaultId, record.id, record.revision);
      setRecords(session.records.filter((item) => item.id !== record.id));
    } catch (caughtError) {
      if (caughtError instanceof VaultConflictError) {
        try {
          setRecords(await loadEncryptedVaultRecords(session.userId, session.vaultId, session.keyVersion, session.key));
          setError("This item changed on another device. The latest vault is loaded; review it before deleting.");
          return;
        } catch (syncError) {
          setError(`${caughtError.message} The latest copy could not be synchronized: ${syncError instanceof Error ? syncError.message : "unknown synchronization error"}`);
          return;
        }
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete the encrypted item.");
    }
  };

  return (
    <AppShell title={title} activePath={activePath}>
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Encrypted vault category</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
          </div>
          <button type="button" onClick={openNew} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            Add {title.slice(0, -1).toLowerCase()}
          </button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label className="sr-only" htmlFor={`${itemType}-search`}>Search decrypted {title.toLowerCase()}</label>
          <input id={`${itemType}-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()} (local only)`} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
          <select aria-label="Filter by folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="all">All folders</option>
            {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
          </select>
          <select aria-label="Sort items" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name</option>
            <option value="favorite">Favorites first</option>
          </select>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((record) => (
            <article key={record.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-white">{displayCategoryTitle(record, title.slice(0, -1))}</h3>
                  <p className="mt-1 text-xs text-slate-500">{String(record.content.folder ?? "General")} · Updated {new Date(String(record.content.updated ?? record.content.created ?? "")).toLocaleDateString()}</p>
                </div>
                <button type="button" aria-label={record.content.favorite ? "Remove favorite" : "Add favorite"} onClick={() => void toggleFavorite(record)} className="text-lg text-amber-300">
                  {record.content.favorite ? "★" : "☆"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.isArray(record.content.tags) && record.content.tags.map((tag) => (
                  <span key={String(tag)} className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-200">#{String(tag)}</span>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => openEdit(record)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">Open / edit</button>
                <button type="button" onClick={() => void remove(record)} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200">Delete</button>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-3">
              {query || folderFilter !== "all" ? "No items match these filters." : `No encrypted ${title.toLowerCase()} yet.`}
            </p>
          )}
        </div>
      </section>

      {(editing || Object.keys(form).length > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSave} className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-2xl font-semibold text-white">{editing ? "Edit item" : `Add ${title.slice(0, -1).toLowerCase()}`}</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={field.name} className={`block text-sm text-slate-300 ${field.multiline ? "sm:col-span-2" : ""}`}>
                  {field.label}
                  {field.multiline ? (
                    field.sensitive && !visibleFields.has(field.name) ? (
                      <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-3">
                        <span className="text-sm text-slate-500">{form[field.name] ? "••••••••••••" : "No value"}</span>
                        <button type="button" onClick={() => setVisibleFields((current) => new Set(current).add(field.name))} className="rounded-md px-2 py-1 text-xs text-blue-300">Reveal</button>
                      </div>
                    ) : (
                    <textarea required={field.required} value={form[field.name] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} rows={5} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    )
                  ) : (
                    <div className="relative mt-2">
                      <input
                        type={field.sensitive && !visibleFields.has(field.name) ? "password" : field.type ?? "text"}
                        value={form[field.name] ?? ""}
                        required={field.required}
                        autoComplete="off"
                        placeholder={field.placeholder}
                        onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pr-20 text-white"
                      />
                      {field.sensitive && (
                        <button
                          type="button"
                          onClick={() => setVisibleFields((current) => {
                            const next = new Set(current);
                            if (next.has(field.name)) next.delete(field.name);
                            else next.add(field.name);
                            return next;
                          })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-blue-300"
                        >
                          {visibleFields.has(field.name) ? "Hide" : "Reveal"}
                        </button>
                      )}
                    </div>
                  )}
                  {field.multiline && field.sensitive && visibleFields.has(field.name) && (
                    <button type="button" onClick={() => setVisibleFields((current) => {
                      const next = new Set(current);
                      next.delete(field.name);
                      return next;
                    })} className="mt-1 text-xs text-blue-300">Hide</button>
                  )}
                </label>
              ))}
              {COMMON_FIELDS.map((field) => (
                <label key={field.name} className="block text-sm text-slate-300">
                  {field.label}
                  <input value={form[field.name] ?? ""} autoComplete="off" placeholder={field.placeholder} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
              ))}
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeForm} disabled={isSubmitting} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {isSubmitting ? "Encrypting..." : "Encrypt and save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
