import { ArrowUpRight, KeyRound, Plus, Search, ShieldCheck } from "lucide-react";

import type { PasswordSummary } from "../types";

type Props = {
  records: PasswordSummary[];
  activeOrigin: string;
  query: string;
  folder: string;
  onQueryChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onOpen: (id: string) => void;
  onFill: (id: string) => void;
  onAdd: () => void;
};

export function PasswordList({
  records,
  activeOrigin,
  query,
  folder,
  onQueryChange,
  onFolderChange,
  onOpen,
  onFill,
  onAdd,
}: Props) {
  const folders = [...new Set(records.map((record) => record.folder || "General"))].sort();
  const filtered = records.filter((record) => {
    const matchesText = `${record.site} ${record.url} ${record.username} ${record.email} ${record.folder} ${record.tags.join(" ")}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesFolder = folder === "All folders" || (record.folder || "General") === folder;
    return matchesText && matchesFolder;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Passwords</p>
          <p className="text-xs text-slate-400">{records.length} encrypted records</p>
        </div>
        <button className="icon-button" type="button" onClick={onAdd} aria-label="Add password">
          <Plus size={17} />
        </button>
      </div>
      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search vault" aria-label="Search passwords" />
      </label>
      <select className="field-control" value={folder} onChange={(event) => onFolderChange(event.target.value)} aria-label="Filter by folder">
        <option>All folders</option>
        {folders.map((name) => <option key={name}>{name}</option>)}
      </select>

      <div className="max-h-[355px] space-y-2 overflow-y-auto pr-1">
        {filtered.map((record) => {
          let matchesSite = false;
          try {
            matchesSite = Boolean(activeOrigin) && new URL(record.url).origin === activeOrigin;
          } catch {
            matchesSite = false;
          }
          return (
            <article key={record.id} className="credential-card">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(record.id)}>
                <span className="flex items-center gap-2">
                  <span className="credential-icon"><KeyRound size={15} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-100">{record.site || record.url}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{record.username || record.email || "No username"}</span>
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{record.folder || "General"}</span>
                  <span>·</span>
                  <span>{record.strength}</span>
                  {record.favorite && <span className="text-amber-300">Favorite</span>}
                </span>
              </button>
              {matchesSite ? (
                <button type="button" className="fill-button" onClick={() => onFill(record.id)} aria-label={`Fill ${record.site} credentials`}>
                  <ShieldCheck size={14} /> Fill
                </button>
              ) : (
                <a className="icon-button" href={record.url} target="_blank" rel="noreferrer" aria-label={`Open ${record.site} website`}>
                  <ArrowUpRight size={15} />
                </a>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <KeyRound size={21} />
            <p>{records.length === 0 ? "Your vault is ready for its first password." : "No passwords match your search."}</p>
          </div>
        )}
      </div>
    </section>
  );
}
