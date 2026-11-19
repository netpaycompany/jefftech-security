import { useEffect, useState } from "react";
import { ExternalLink, LockKeyhole, Shield, Trash2 } from "lucide-react";

import type { ExtensionSettings } from "../types";

type Props = {
  settings: ExtensionSettings;
  onSave: (settings: ExtensionSettings) => Promise<void>;
  onDisconnect: () => void;
  onOpenWebsite: () => void;
};

export function SettingsPanel({ settings, onSave, onDisconnect, onOpenWebsite }: Props) {
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState(settings.clipboardClearSeconds);
  const [sites, setSites] = useState<string[]>([]);
  const [siteError, setSiteError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void chrome.permissions.getAll().then((permissions) => {
      setSites((permissions.origins ?? [])
        .filter((origin) => origin.startsWith("https://") && !origin.includes("supabase.co"))
        .sort());
    }).catch(() => setSiteError("Could not load website permissions. Reopen the popup and try again."));
  }, []);

  const removeSite = async (pattern: string) => {
    setBusy(true);
    setSiteError("");
    try {
      await chrome.permissions.remove({ origins: [pattern] });
      setSites((current) => current.filter((site) => site !== pattern));
      const registrations = await chrome.scripting.getRegisteredContentScripts();
      const targetHost = new URL(pattern.replace("/*", "")).hostname;
      const script = registrations.find((entry) => entry.matches?.some((match) => {
        try {
          return new URL(match.replace("/*", "")).hostname === targetHost;
        } catch {
          return false;
        }
      }));
      if (script?.id) await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : "Could not revoke website access.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Settings</p>
        <p className="text-xs text-slate-400">Preferences stay on this browser and are not synced.</p>
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <label className="field-label">Clear copied password after
          <select className="field-control" value={clipboardClearSeconds} onChange={(event) => setClipboardClearSeconds(Number(event.target.value))}>
            <option value={0}>Do not clear automatically</option>
            {[15, 30, 60, 120].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
        </label>
        <button
          type="button"
          className="primary-button w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onSave({ clipboardClearSeconds }).finally(() => setBusy(false));
          }}
        >
          <LockKeyhole size={15} /> Save preferences
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Shield size={15} className="text-blue-300" /> Autofill site permissions</div>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">The extension can read login fields only on sites you explicitly enable. You can revoke access here.</p>
        {siteError && <p role="alert" className="mt-2 text-[11px] text-red-300">{siteError}</p>}
        <ul className="mt-3 space-y-2">
          {sites.map((site) => (
            <li key={site} className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="truncate">{site.replace("/*", "")}</span>
              <button type="button" className="icon-button text-red-300" aria-label={`Revoke access to ${site}`} disabled={busy} onClick={() => void removeSite(site)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {sites.length === 0 && <li className="text-xs text-slate-500">No website permissions enabled.</li>}
        </ul>
      </div>

      <button type="button" className="secondary-button w-full" onClick={onOpenWebsite}>
        <ExternalLink size={14} /> Manage connected extensions on Jefftech
      </button>
      <button type="button" className="danger-button w-full" onClick={onDisconnect}>Disconnect this account</button>
      <p className="text-[10px] leading-4 text-slate-500">The vault stays unlocked in memory until you lock it, disconnect, or the browser ends the extension session. This keeps the vault key available while you save credentials, but means anyone using this browser profile can access the unlocked vault.</p>
    </section>
  );
}
