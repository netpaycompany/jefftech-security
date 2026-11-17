import { useState, type FormEvent } from "react";

import type { PasswordRecord } from "../types";
import { passwordStrength } from "../utils/security";

type Props = {
  initial: PasswordRecord | null;
  initialPassword?: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (record: PasswordRecord) => Promise<void>;
  onGenerate: (record: PasswordRecord) => void;
};

function blankRecord(password = ""): PasswordRecord {
  const now = new Date().toISOString().slice(0, 10);
  return {
    site: "",
    url: "",
    username: "",
    password,
    email: "",
    folder: "General",
    note: "",
    tags: [],
    strength: passwordStrength(password),
    created: now,
    updated: now,
    favorite: false,
    passwordHistory: [],
  };
}

export function PasswordEditor({ initial, initialPassword = "", busy, onCancel, onSave, onGenerate }: Props) {
  const [record, setRecord] = useState<PasswordRecord>(() => initial ? { ...initial } : blankRecord(initialPassword));
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof PasswordRecord>(key: K, value: PasswordRecord[K]) => {
    setRecord((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSave({
      ...record,
      site: record.site.trim(),
      url: record.url.trim(),
      tags: record.tags.filter(Boolean),
      strength: passwordStrength(record.password),
    });
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{initial ? "Edit password" : "Add password"}</p>
          <p className="text-xs text-slate-400">Encrypted on this device before syncing.</p>
        </div>
        <span className={`strength strength-${passwordStrength(record.password).toLowerCase()}`}>
          {passwordStrength(record.password)}
        </span>
      </div>
      <label className="field-label">Website name
        <input className="field-control" required maxLength={200} value={record.site} onChange={(event) => update("site", event.target.value)} placeholder="Example" />
      </label>
      <label className="field-label">Website URL
        <input className="field-control" required type="url" pattern="https://.*" value={record.url} onChange={(event) => update("url", event.target.value)} placeholder="https://example.com" />
      </label>
      <label className="field-label">Username
        <input className="field-control" maxLength={500} autoComplete="username" value={record.username} onChange={(event) => update("username", event.target.value)} />
      </label>
      <label className="field-label">Password
        <div className="password-input">
          <input className="field-control" required type={showPassword ? "text" : "password"} autoComplete="new-password" value={record.password} onChange={(event) => update("password", event.target.value)} />
          <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
        </div>
      </label>
      <button type="button" className="text-button" onClick={() => onGenerate(record)}>Generate a secure password</button>
      <label className="field-label">Folder
        <input className="field-control" maxLength={200} value={record.folder} onChange={(event) => update("folder", event.target.value)} placeholder="General" />
      </label>
      <label className="field-label">Notes
        <textarea className="field-control min-h-16 resize-y" maxLength={10_000} value={record.note} onChange={(event) => update("note", event.target.value)} />
      </label>
      <label className="field-label">Tags
        <input className="field-control" value={record.tags.join(", ")} onChange={(event) => update("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} placeholder="work, personal" />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={record.favorite} onChange={(event) => update("favorite", event.target.checked)} />
        Add to favorites
      </label>
      <div className="flex gap-2 pt-1">
        <button className="primary-button flex-1" type="submit" disabled={busy}>{busy ? "Encrypting…" : initial ? "Save changes" : "Encrypt and save"}</button>
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
