"use client";

import { useState, type ChangeEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import { bytesToBase64, decodeCanonicalBase64 } from "@/lib/security";
import { deleteEncryptedPasswordRecord, saveEncryptedVaultItem, type VaultItem } from "@/lib/vault";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function SecureDocuments() {
  const { session, setRecords } = useVault();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  if (!session) {
    return (
      <AppShell title="Secure Documents" activePath="/documents">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-white">Vault is locked</h2>
          <p className="mt-2 text-sm text-slate-400">Unlock to manage encrypted documents.</p>
          <a href="/master-password" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white">Unlock vault</a>
        </section>
      </AppShell>
    );
  }

  const documents = session.records.filter((item) => item.itemType === "document");

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
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white">Encrypted document storage</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Files up to 2 MiB are encrypted as vault records in this browser before upload. File names, media types, and contents are encrypted. Documents are not previewed in the page.
        </p>
        <label className="mt-5 inline-flex cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
          {isBusy ? "Saving..." : "Choose file and encrypt"}
          <input type="file" disabled={isBusy} onChange={(event) => void upload(event)} className="sr-only" />
        </label>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        <ul className="mt-6 space-y-3">
          {documents.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div>
                <p className="font-medium text-white">{String(item.content.title ?? "Encrypted document")}</p>
                <p className="mt-1 text-xs text-slate-400">{Number(item.content.size ?? 0).toLocaleString()} bytes · Encrypted at rest</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={isBusy} onClick={() => download(item)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">Decrypt and download</button>
                <button type="button" disabled={isBusy} onClick={() => void remove(item)} className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-200 disabled:opacity-50">Delete</button>
              </div>
            </li>
          ))}
          {documents.length === 0 && <li className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No encrypted documents yet.</li>}
        </ul>
      </section>
    </AppShell>
  );
}
