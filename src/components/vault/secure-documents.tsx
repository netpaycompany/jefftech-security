"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, FileLock2, FileText, Image as ImageIcon, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import { bytesToBase64, decodeCanonicalBase64 } from "@/lib/security";
import { deleteEncryptedPasswordRecord, saveEncryptedVaultItem, type VaultItem } from "@/lib/vault";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function SecureDocuments() {
  const { session, setRecords } = useVault();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState("all");
  const documents = session?.records.filter((item) => item.itemType === "document") ?? [];
  const filteredDocuments = documents.filter((item) => {
    const name = String(item.content.title ?? "").toLocaleLowerCase();
    const mediaType = String(item.content.mediaType ?? "");
    const kind = mediaType.startsWith("image/") ? "image" : mediaType === "application/pdf" ? "pdf" : "other";
    return name.includes(query.trim().toLocaleLowerCase()) && (fileFilter === "all" || kind === fileFilter);
  });

  if (!session) {
    return (
      <AppShell title="Secure Documents" activePath="/documents">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm text-slate-400">Unlock to manage encrypted documents.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/vault" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
              <ArrowLeft className="h-4 w-4" /> Back to Vault Items
            </Link>
            <Link href="/master-password" className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white">Unlock vault</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    setError("");
    if (!file) return;
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setError("Choose a non-empty file no larger than 2 MiB. The encrypted vault record has a fixed size limit.");
      return;
    }

    setIsBusy(true);
    let bytes: Uint8Array | null = null;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      const fileContent = bytesToBase64(bytes);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const content = {
        title: file.name,
        mediaType: file.type || "application/octet-stream",
        size: file.size,
        fileContent,
        folder: "Documents",
        tags: [],
        created: now,
        updated: now,
      };
      const revision = await saveEncryptedVaultItem(
        content,
        "document",
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
        id,
        null,
      );
      const saved: VaultItem = { id, revision, itemType: "document", content };
      setRecords([saved, ...session.records]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The document could not be encrypted and saved.");
    } finally {
      bytes?.fill(0);
      setIsBusy(false);
    }
  };

  const download = (item: VaultItem) => {
    try {
      const encoded = item.content.fileContent;
      const name = item.content.title;
      const mediaType = item.content.mediaType;
      if (typeof encoded !== "string" || typeof name !== "string" || typeof mediaType !== "string") {
        throw new Error("The encrypted document has invalid metadata.");
      }
      const bytes = decodeCanonicalBase64(encoded);
      const objectUrl = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mediaType }));
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name.replace(/[\\/]/g, "_").slice(0, 240) || "document";
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      bytes.fill(0);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The document could not be decrypted.");
    }
  };

  const remove = async (item: VaultItem) => {
    if (!window.confirm("Delete this encrypted document permanently?")) return;
    setError("");
    setIsBusy(true);
    try {
      await deleteEncryptedPasswordRecord(session.vaultId, item.id, item.revision);
      setRecords(session.records.filter((record) => record.id !== item.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The encrypted document could not be deleted.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AppShell title="Secure Documents" activePath="/documents">
      <Link href="/vault" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/10">
        <ArrowLeft className="h-4 w-4" />
        Back to Vault Items
      </Link>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/70 to-slate-950 p-4 sm:mb-5 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300"><FileLock2 className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">Secure Documents</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">Files up to 2 MiB are encrypted in your browser. Names, file types, and contents stay encrypted in the vault.</p>
          </div>
        </div>
        <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-cyan-400 hover:to-blue-500">
          <Plus className="h-4 w-4" />
          {isBusy ? "Encrypting..." : "Add Document"}
          <input type="file" disabled={isBusy} onChange={(event) => void upload(event)} className="sr-only" />
        </label>
      </section>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      <section aria-label="Search and filter secure documents" className="mb-4 space-y-3 sm:mb-5">
        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-blue-400/40 bg-gradient-to-r from-blue-950/70 to-slate-950 px-3.5 py-3 focus-within:border-blue-300">
          <Search className="h-5 w-5 shrink-0 text-blue-200" />
          <span className="sr-only">Search secure documents</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-300" />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { value: "all", label: `All (${documents.length})` },
            { value: "pdf", label: `PDFs (${documents.filter((item) => item.content.mediaType === "application/pdf").length})` },
            { value: "image", label: `Images (${documents.filter((item) => String(item.content.mediaType ?? "").startsWith("image/")).length})` },
            { value: "other", label: `Other (${documents.filter((item) => !String(item.content.mediaType ?? "").startsWith("image/") && item.content.mediaType !== "application/pdf").length})` },
          ].map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setFileFilter(value)} aria-pressed={fileFilter === value} className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-xs font-medium sm:text-sm ${fileFilter === value ? "border-cyan-300/60 bg-gradient-to-r from-cyan-500 to-blue-600 text-white" : "border-blue-400/35 bg-slate-950/70 text-slate-200 hover:bg-blue-500/10"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <ul className="space-y-2 sm:space-y-3">
        {filteredDocuments.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-3 sm:min-h-[84px] sm:gap-4 sm:px-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
              {String(item.content.mediaType ?? "").startsWith("image/") ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white sm:text-base">{String(item.content.title ?? "Encrypted document")}</p>
              <p className="mt-0.5 truncate text-xs text-slate-300">{Number(item.content.size ?? 0).toLocaleString()} bytes · Encrypted at rest</p>
            </div>
            <button type="button" disabled={isBusy} onClick={() => download(item)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-blue-400/40 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/10 disabled:opacity-50">
              Decrypt and download <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" disabled={isBusy} onClick={() => void remove(item)} className="rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-200 disabled:opacity-50">Delete</button>
          </li>
        ))}
        {filteredDocuments.length === 0 && (
          <li className="rounded-2xl border border-dashed border-blue-300/40 bg-slate-950/40 p-8 text-center text-sm text-slate-300">
            {documents.length === 0 ? "No encrypted documents yet. Add a document to store it securely." : "No documents match these filters."}
          </li>
        )}
      </ul>
    </AppShell>
  );
}
