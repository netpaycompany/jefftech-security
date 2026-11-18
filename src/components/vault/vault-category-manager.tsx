"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  FileLock2,
  FileText,
  IdCard,
  KeyRound,
  NotebookPen,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
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
  type?: "text" | "email" | "url" | "date" | "select";
  options?: { value: string; label: string }[];
};

type CategoryFacet = {
  field: string;
  options: { value: string; label: string }[];
};

const COMMON_FIELDS: VaultFieldDefinition[] = [
  { name: "folder", label: "Folder", placeholder: "General" },
  { name: "tags", label: "Tags", placeholder: "Separate tags with commas" },
];

const categoryPresentation: Record<string, { icon: typeof KeyRound; color: string; addLabel: string; fallback: string }> = {
  note: { icon: NotebookPen, color: "text-fuchsia-300 bg-violet-500/20", addLabel: "Add Note", fallback: "Secure note" },
  identity: { icon: IdCard, color: "text-teal-300 bg-teal-500/20", addLabel: "Add Identity", fallback: "Identity" },
  card: { icon: CreditCard, color: "text-amber-300 bg-amber-500/20", addLabel: "Add Card", fallback: "Payment card" },
  bank_account: { icon: Building2, color: "text-cyan-300 bg-cyan-500/20", addLabel: "Add Account", fallback: "Bank account" },
  recovery_code: { icon: FileLock2, color: "text-violet-300 bg-indigo-500/20", addLabel: "Add Code", fallback: "Recovery code" },
  license: { icon: BadgeCheck, color: "text-emerald-300 bg-teal-500/20", addLabel: "Add License", fallback: "Software license" },
  document: { icon: FileText, color: "text-sky-300 bg-blue-500/20", addLabel: "Add Document", fallback: "Secure document" },
};

function displayCategoryTitle(record: VaultItem, fallback: string) {
  return String(
    record.content.title
    ?? record.content.name
    ?? record.content.site
    ?? record.content.softwareName
    ?? record.content.bankName
    ?? record.content.fullName
    ?? record.content.accountName
    ?? fallback,
  );
}

function formatCategoryDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "Recently";
}

function displayCategorySummary(record: VaultItem, itemType: string) {
  if (itemType === "card") {
    const digits = String(record.content.cardNumber ?? "").replace(/\D/g, "");
    const ending = digits ? ` · •••• ${digits.slice(-4)}` : "";
    return `${String(record.content.cardType ?? "Payment card")}${ending}`;
  }
  if (itemType === "bank_account") {
    const digits = String(record.content.accountNumber ?? "").replace(/\D/g, "");
    const ending = digits ? ` · •••• ${digits.slice(-4)}` : "";
    return `${String(record.content.accountType ?? "Bank account")}${ending}`;
  }
  if (itemType === "identity") {
    return String(record.content.email ?? record.content.phone ?? "Personal information");
  }
  if (itemType === "recovery_code") {
    return String(record.content.codeType ?? "Recovery codes");
  }
  if (itemType === "license") {
    return String(record.content.licenseType ?? "Software license");
  }
  return itemType === "note" ? "Encrypted note" : "";
}

export function VaultCategoryManager({
  itemType,
  title,
  description,
  fields,
  activePath,
  facet,
}: {
  itemType: string;
  title: string;
  description: string;
  fields: VaultFieldDefinition[];
  activePath: string;
  facet?: CategoryFacet;
}) {
  const { session, setRecords } = useVault();
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [selectedFacet, setSelectedFacet] = useState("all");
  const [recentCutoff, setRecentCutoff] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
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
  const tags = useMemo(
    () => [...new Set(categoryRecords.flatMap((record) => Array.isArray(record.content.tags)
      ? record.content.tags.map(String)
      : []))].sort(),
    [categoryRecords],
  );
  const favoriteCount = categoryRecords.filter((record) => Boolean(record.content.favorite)).length;
  const recentCount = recentCutoff
    ? categoryRecords.filter((record) => String(record.content.updated ?? record.content.created ?? "") >= recentCutoff).length
    : null;
  const presentation = categoryPresentation[itemType] ?? {
    icon: KeyRound,
    color: "text-cyan-300 bg-cyan-500/20",
    addLabel: `Add ${title}`,
    fallback: title,
  };
  const CategoryIcon = presentation.icon;
  const filtered = useMemo(() => categoryRecords
    .filter((item) => selectedFacet !== "favorites" || Boolean(item.content.favorite))
    .filter((item) => selectedFacet !== "recent" || (() => {
      return Boolean(recentCutoff) && String(item.content.updated ?? item.content.created ?? "") >= recentCutoff;
    })())
    .filter((item) => selectedFacet === "all" || selectedFacet === "favorites" || selectedFacet === "recent"
      || (facet ? item.content[facet.field] === selectedFacet : true))
    .filter((item) => tagFilter === "all" || (Array.isArray(item.content.tags) && item.content.tags.includes(tagFilter)))
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
    }), [categoryRecords, facet, folderFilter, query, recentCutoff, selectedFacet, sortBy, tagFilter, title]);

  if (!session) {
    return (
      <AppShell title={title} activePath={activePath}>
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm text-slate-400">Unlock your vault to view or manage encrypted {title.toLowerCase()}.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/vault" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
              <ArrowLeft className="h-4 w-4" /> Back to Vault Items
            </Link>
            <Link href="/master-password" className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">Unlock vault</Link>
          </div>
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
      <Link href="/vault" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/10">
        <ArrowLeft className="h-4 w-4" />
        Back to Vault Items
      </Link>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/70 to-slate-950 p-4 sm:mb-5 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${presentation.color}`}>
            <CategoryIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">{description}</p>
          </div>
        </div>
        <button type="button" onClick={openNew} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-cyan-400 hover:to-blue-500">
          <Plus className="h-4 w-4" />
          {presentation.addLabel}
        </button>
      </section>

      <section aria-label={`Search and filter ${title.toLowerCase()}`} className="mb-4 space-y-3 sm:mb-5">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-blue-400/40 bg-gradient-to-r from-blue-950/70 to-slate-950 px-3.5 py-3 focus-within:border-blue-300">
            <KeyRound className="h-5 w-5 shrink-0 text-blue-200" />
            <span className="sr-only">Search {title.toLowerCase()}</span>
            <input
              id={`${itemType}-search`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-300"
            />
          </label>
          <details className="relative">
            <summary aria-label="More filters and sorting" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-2xl border border-blue-400/40 bg-slate-950 text-blue-200 [&::-webkit-details-marker]:hidden">
              <CalendarDays className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-60 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
              <label className="block text-xs text-slate-300">
                Folder
                <select aria-label="Filter by folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                  <option value="all">All folders</option>
                  {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
              </label>
              {tags.length > 0 && (
                <label className="block text-xs text-slate-300">
                  Tag
                  <select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                    <option value="all">All tags</option>
                    {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </label>
              )}
              {facet && (
                <label className="block text-xs text-slate-300">
                  {facet.options.length ? "Category" : "Type"}
                  <select aria-label={`Filter ${title.toLowerCase()} by type`} value={selectedFacet === "favorites" || selectedFacet === "recent" ? "all" : selectedFacet} onChange={(event) => setSelectedFacet(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                    <option value="all">All types</option>
                    {facet.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-xs text-slate-300">
                Sort by
                <select aria-label="Sort items" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                  <option value="updated">Recently updated</option>
                  <option value="created">Recently created</option>
                  <option value="name">Name</option>
                  <option value="favorite">Favorites first</option>
                </select>
              </label>
            </div>
          </details>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { value: "all", label: `All (${categoryRecords.length})` },
            { value: "favorites", label: `Favorites (${favoriteCount})` },
            { value: "recent", label: recentCount === null ? "Recent" : `Recent (${recentCount})` },
            ...(facet?.options.map((option) => ({
              value: option.value,
              label: `${option.label} (${categoryRecords.filter((record) => record.content[facet.field] === option.value).length})`,
            })) ?? []),
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === "recent") {
                  setRecentCutoff(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
                }
                setSelectedFacet(value);
              }}
              aria-pressed={selectedFacet === value}
              className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-xs font-medium sm:text-sm ${selectedFacet === value ? "border-cyan-300/60 bg-gradient-to-r from-cyan-500 to-blue-600 text-white" : "border-blue-400/35 bg-slate-950/70 text-slate-200 hover:bg-blue-500/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}

      <section aria-label={`${title} records`} className="space-y-2 sm:space-y-3">
          {filtered.map((record) => (
            <article key={record.id} className="flex min-h-[76px] flex-wrap items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-3 sm:min-h-[84px] sm:gap-4 sm:px-5">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${presentation.color}`}>
                <CategoryIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-white sm:text-base">{displayCategoryTitle(record, presentation.fallback)}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-300">
                  {displayCategorySummary(record, itemType)}
                  {record.content.folder ? ` · ${String(record.content.folder)}` : ""}
                  {` · Updated ${formatCategoryDate(record.content.updated ?? record.content.created)}`}
                </p>
                {Array.isArray(record.content.tags) && record.content.tags.length > 0 && (
                  <p className="mt-1 truncate text-[10px] text-blue-200">{record.content.tags.map(String).map((tag) => `#${tag}`).join(" ")}</p>
                )}
              </div>
              <button type="button" aria-label={record.content.favorite ? "Remove favorite" : "Add favorite"} onClick={() => void toggleFavorite(record)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/10">
                <Star className={`h-5 w-5 ${record.content.favorite ? "fill-current" : ""}`} />
              </button>
              <button type="button" onClick={() => openEdit(record)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10">
                Open <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void remove(record)} aria-label={`Delete ${displayCategoryTitle(record, presentation.fallback)}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="hidden text-right text-[10px] text-slate-500 sm:block">
                <CalendarDays className="mx-auto mb-1 h-4 w-4" />
                {formatCategoryDate(record.content.updated ?? record.content.created)}
              </div>
              <div className="sr-only">
                {record.content.folder ? `${String(record.content.folder)} folder` : ""}
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl border border-dashed border-blue-300/40 bg-slate-950/40 p-8 text-center text-sm text-slate-300">
              {query || folderFilter !== "all" || tagFilter !== "all" || selectedFacet !== "all" ? "No items match these filters." : `No encrypted ${title.toLowerCase()} yet.`}
            </p>
          )}
      </section>

      {(editing || Object.keys(form).length > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSave} className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-2xl font-semibold text-white">{editing ? "Edit item" : presentation.addLabel}</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={field.name} className={`block text-sm text-slate-300 ${field.multiline ? "sm:col-span-2" : ""}`}>
                  {field.label}
                  {field.type === "select" ? (
                    <select
                      value={form[field.name] ?? ""}
                      required={field.required}
                      onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                    >
                      <option value="">Select {field.label.toLowerCase()}</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.multiline ? (
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
