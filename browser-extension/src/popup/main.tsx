import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Copy,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  UnlockKeyhole,
} from "lucide-react";

import { HealthPanel, type HealthMetrics } from "../components/HealthPanel";
import { GeneratorPanel } from "../components/GeneratorPanel";
import { PasswordEditor } from "../components/PasswordEditor";
import { PasswordList } from "../components/PasswordList";
import { SettingsPanel } from "../components/SettingsPanel";
import type { ExtensionSettings, PasswordRecord, PasswordSummary, VaultPassword } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { generatePassword, isAllowedOrigin, passwordStrength } from "../utils/security";
import "./styles.css";

declare const __JEFFTECH_APP_URL__: string;

type Screen = "home" | "list" | "details" | "editor" | "generator" | "health" | "settings";
type ExtensionState = { authenticated: boolean; unlocked: boolean; count: number };
type MessageResponse<T> = { ok: true; result: T } | { ok: false; error: string };
const SESSION_INVALID_EVENT = "jefftech:session-invalid";

function request<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Jefftech extension service is unavailable. Try reopening the popup."));
      } else if (!response?.ok) {
        if (response?.error && /vault locked|session (?:has been )?(?:revoked|expired)|session was revoked/i.test(response.error)) {
          window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
        }
        reject(new Error(response?.error ?? "The extension request failed."));
      } else {
        resolve(response.result);
      }
    });
  });
}

function originPattern(origin: string) {
  const url = new URL(origin);
  return `https://${url.hostname}/*`;
}

function scriptIdFor(origin: string) {
  const hostname = new URL(origin).hostname.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `jefftech-autofill-${hostname}`.slice(0, 100);
}

function emptyRecord(origin: string): PasswordRecord {
  const now = new Date().toISOString().slice(0, 10);
  let hostname = "";
  try { hostname = new URL(origin).hostname; } catch { hostname = ""; }
  return {
    site: hostname,
    url: origin,
    username: "",
    password: "",
    email: "",
    folder: "General",
    note: "",
    tags: [],
    strength: "Weak",
    created: now,
    updated: now,
    favorite: false,
    passwordHistory: [],
  };
}

function PopupApp() {
  const [state, setState] = useState<ExtensionState>({ authenticated: false, unlocked: false, count: 0 });
  const [screen, setScreen] = useState<Screen>("home");
  const [records, setRecords] = useState<PasswordSummary[]>([]);
  const [health, setHealth] = useState<HealthMetrics>({ total: 0, weak: 0, reused: 0, old: 0 });
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [activeOrigin, setActiveOrigin] = useState("");
  const [siteEnabled, setSiteEnabled] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<VaultPassword | null>(null);
  const [editorRecord, setEditorRecord] = useState<PasswordRecord | null>(null);
  const [editorId, setEditorId] = useState<string | undefined>();
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("All folders");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDetailsPassword, setShowDetailsPassword] = useState(false);
  const clipboardTimer = useRef<number | null>(null);

  const refreshVault = useCallback(async () => {
    const [nextRecords, metrics] = await Promise.all([
      request<PasswordSummary[]>({ type: "list" }),
      request<HealthMetrics>({ type: "health" }),
    ]);
    setRecords(nextRecords);
    setHealth(metrics);
    setState((current) => ({ ...current, count: nextRecords.length, unlocked: true }));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      request<ExtensionState>({ type: "state" }),
      request<ExtensionSettings>({ type: "settings" }),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]).then(async ([nextState, nextSettings, tabs]) => {
      if (!active) return;
      setState(nextState);
      setSettings(nextSettings);
      const tabUrl = tabs[0]?.url ?? "";
      try {
        const url = new URL(tabUrl);
        if (url.protocol === "https:") {
          setActiveOrigin(url.origin);
          setSiteEnabled(await chrome.permissions.contains({ origins: [originPattern(url.origin)] }));
        }
      } catch {
        setActiveOrigin("");
      }
      if (nextState.unlocked) await refreshVault();
    }).catch((caughtError: unknown) => {
      if (active) setError(caughtError instanceof Error ? caughtError.message : "Could not load extension state.");
    });
    return () => {
      active = false;
      if (clipboardTimer.current !== null) window.clearTimeout(clipboardTimer.current);
    };
  }, [refreshVault]);

  useEffect(() => {
    const handleInvalidSession = () => {
      setState({ authenticated: false, unlocked: false, count: 0 });
      setRecords([]);
      setSelectedRecord(null);
      setEditorRecord(null);
      setMasterPassword("");
      setShowDetailsPassword(false);
      setScreen("home");
      setError("This extension session was revoked or expired. Connect your account again.");
    };
    window.addEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
    return () => window.removeEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
  }, []);

  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const nextState = await request<ExtensionState>({ type: "connect" });
      setState(nextState);
      setNotice("Your Jefftech account is connected. Unlock the vault to continue.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not connect your account.");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const password = masterPassword;
    setMasterPassword("");
    setBusy(true);
    try {
      await request({ type: "unlock", masterPassword: password });
      await refreshVault();
      setScreen("home");
      setNotice("Vault unlocked on this device.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The vault could not be unlocked.");
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    setError("");
    try {
      await request({ type: "lock" });
      setState((current) => ({ ...current, unlocked: false, count: 0 }));
      setRecords([]);
      setSelectedRecord(null);
      setEditorRecord(null);
      setScreen("home");
      setNotice("Vault locked.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not lock the vault.");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect this Jefftech account and revoke this extension session?")) return;
    setError("");
    setBusy(true);
    try {
      await request({ type: "disconnect" });
      setState({ authenticated: false, unlocked: false, count: 0 });
      setRecords([]);
      setSelectedRecord(null);
      setScreen("home");
      setNotice("The account was disconnected and this extension session revoked.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not disconnect the account.");
    } finally {
      setBusy(false);
    }
  };

  const enableAutofill = async () => {
    if (!activeOrigin || !isAllowedOrigin(activeOrigin)) {
      setError("Autofill is available only on an HTTPS website.");
      return;
    }
    const pattern = originPattern(activeOrigin);
    setError("");
    try {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) {
        setError("Website permission was not granted. Autofill remains disabled for this site.");
        return;
      }
      const id = scriptIdFor(activeOrigin);
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
      if (existing.length === 0) {
        await chrome.scripting.registerContentScripts([{
          id,
          matches: [pattern],
          js: ["content.js"],
          runAt: "document_idle",
          allFrames: false,
          persistAcrossSessions: true,
        }]);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      }
      setSiteEnabled(true);
      setNotice(`Autofill is enabled for ${new URL(activeOrigin).hostname}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not enable autofill for this website.");
    }
  };

  const openRecord = async (id: string) => {
    setError("");
    try {
      const record = await request<VaultPassword>({ type: "get-record", id });
      setSelectedRecord(record);
      setShowDetailsPassword(false);
      setScreen("details");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not open the password record.");
    }
  };

  const startAdd = () => {
    setEditorId(undefined);
    setEditorRecord(emptyRecord(activeOrigin));
    setGeneratedPassword("");
    setScreen("editor");
  };

  const startEdit = () => {
    if (!selectedRecord) return;
    const { id, revision: _revision, ...record } = selectedRecord;
    setEditorId(id);
    setEditorRecord(record);
    setGeneratedPassword("");
    setScreen("editor");
  };

  const saveRecord = async (record: PasswordRecord) => {
    setBusy(true);
    setError("");
    try {
      const saved = await request<{ id: string; revision: number }>({
        type: "save-record",
        id: editorId,
        record: { ...record, strength: passwordStrength(record.password) },
      });
      await refreshVault();
      const full = await request<VaultPassword>({ type: "get-record", id: saved.id });
      setSelectedRecord(full);
      setEditorRecord(null);
      setEditorId(undefined);
      setGeneratedPassword("");
      setScreen("details");
      setNotice("Password encrypted and saved to your Jefftech vault.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save this password.");
    } finally {
      setBusy(false);
    }
  };

  const generateAndSaveForCurrentSite = async () => {
    if (!activeOrigin) {
      setError("Open an HTTPS website first to generate a saved password for it.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const password = generatePassword(24, {
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
      const record = {
        ...emptyRecord(activeOrigin),
        password,
        strength: passwordStrength(password),
      };
      await request<{ id: string; revision: number }>({
        type: "save-record",
        record,
      });
      await refreshVault();
      setNotice(`A strong password was generated and encrypted in your vault for ${new URL(activeOrigin).hostname}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not generate and save a password.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRecord = async () => {
    if (!selectedRecord || !window.confirm(`Permanently delete the password for ${selectedRecord.site}?`)) return;
    setBusy(true);
    setError("");
    try {
      await request({ type: "delete-record", id: selectedRecord.id, revision: selectedRecord.revision });
      await refreshVault();
      setSelectedRecord(null);
      setScreen("list");
      setNotice("Password deleted.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete the password.");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(settings.clipboardClearSeconds > 0
        ? `Copied. Clipboard clearing will be attempted in ${settings.clipboardClearSeconds} seconds while this popup stays open.`
        : "Copied. Remember to clear the clipboard when you are done.");
      if (clipboardTimer.current !== null) window.clearTimeout(clipboardTimer.current);
      if (settings.clipboardClearSeconds > 0) {
        clipboardTimer.current = window.setTimeout(async () => {
          try {
            if (await navigator.clipboard.readText() === value) {
              await navigator.clipboard.writeText("");
              setNotice("Copied password was removed from the clipboard.");
            }
          } catch {
            setNotice("Clipboard could not be cleared automatically. Clear it manually.");
          }
        }, settings.clipboardClearSeconds * 1000);
      }
    } catch {
      setError("Clipboard access was denied by the browser. Copy the value manually.");
    }
  };

  const copyRecordField = async (id: string, field: "username" | "password") => {
    try {
      const value = await request<string>({ type: "clipboard-copy", id, field });
      if (value) await copyText(value);
      else setError(field === "username" ? "This record has no username to copy." : "This record has no password to copy.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not copy this value.");
    }
  };

  const useGeneratedPassword = (value: string) => {
    const record = editorRecord ?? emptyRecord(activeOrigin);
    setEditorRecord({ ...record, password: value, strength: passwordStrength(value) });
    setGeneratedPassword(value);
    setScreen("editor");
  };

  const saveSettings = async (nextSettings: ExtensionSettings) => {
    try {
      const saved = await request<ExtensionSettings>({ type: "save-settings", settings: nextSettings });
      setSettings(saved);
      setNotice("Preferences saved on this browser.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save preferences.");
    }
  };

  const title = screen === "details" ? selectedRecord?.site ?? "Password details"
    : screen === "editor" ? editorId ? "Edit password" : "Add password"
      : screen === "generator" ? "Password generator"
        : screen === "health" ? "Security health"
          : screen === "settings" ? "Settings"
            : screen === "list" ? "Your passwords"
              : "Your vault";

  if (!state.authenticated) {
    return (
      <main className="popup-shell">
        <Header title="Password vault" />
        <div className="welcome-panel">
          <div className="brand-mark"><ShieldCheck size={25} /></div>
          <p className="eyebrow">Jefftech Security</p>
          <h1 className="welcome-title">Your vault, one click away.</h1>
          <p className="welcome-copy">Connect your Jefftech account through the official website. Your passwords stay encrypted until you unlock this device.</p>
          <button type="button" className="primary-button w-full" disabled={busy} onClick={() => void connect()}>
            <ShieldCheck size={16} /> {busy ? "Connecting…" : "Connect Jefftech account"}
          </button>
          <p className="privacy-note">Sign-in uses a one-time PKCE authorization code. The extension never asks for your Jefftech account password.</p>
        </div>
        <Notice error={error} notice={notice} />
      </main>
    );
  }

  if (!state.unlocked) {
    return (
      <main className="popup-shell">
        <Header title="Vault locked" />
        <div className="welcome-panel">
          <div className="brand-mark"><LockKeyhole size={23} /></div>
          <p className="eyebrow">Account connected</p>
          <h1 className="welcome-title">Unlock your vault</h1>
          <p className="welcome-copy">Enter your vault master password. It is used only to unwrap the vault key locally and is never stored or sent. The vault stays unlocked in memory until you lock it or the browser ends the extension session.</p>
          <form className="mt-5 space-y-3" onSubmit={(event) => void unlock(event)}>
            <label className="field-label">Vault master password
              <input
                className="field-control"
                type="password"
                autoComplete="off"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
                required
                autoFocus
              />
            </label>
            <button type="submit" className="primary-button w-full" disabled={busy}>
              <UnlockKeyhole size={16} /> {busy ? "Unlocking…" : "Unlock vault"}
            </button>
          </form>
          <button type="button" className="text-button mt-3" onClick={() => void disconnect()} disabled={busy}>
            <LogOut size={14} /> Disconnect account
          </button>
          <p className="privacy-note">If you have not created a vault yet, open Jefftech Security and set up your vault first.</p>
        </div>
        <Notice error={error} notice={notice} />
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-mark small"><ShieldCheck size={19} /></div>
          <div className="min-w-0">
            <p className="eyebrow">Jefftech Security</p>
            <h1 className="truncate text-base font-semibold text-white">{title}</h1>
          </div>
        </div>
        <button type="button" className="icon-button" aria-label="Lock vault" title="Lock vault" onClick={() => void lock()}>
          <LockKeyhole size={16} />
        </button>
      </header>

      <Notice error={error} notice={notice} />

      {screen === "home" && (
        <section className="space-y-4">
          <div className="welcome-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Encrypted vault</p>
                <p className="mt-1 text-lg font-semibold text-white">You&apos;re protected</p>
                <p className="mt-1 text-xs text-slate-400">Decryption happens only on this device.</p>
              </div>
              <span className="secure-pill"><Check size={12} /> Unlocked</span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-amber-200/80">The vault stays unlocked for this browser session so credentials can be saved. Lock it before leaving this browser unattended.</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Metric value={health.total} label="Passwords" />
              <Metric value={health.weak} label="Weak" warning={health.weak > 0} />
              <Metric value={health.reused} label="Reused" warning={health.reused > 0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <QuickAction icon={<KeyRound size={16} />} label="All passwords" onClick={() => setScreen("list")} />
            <QuickAction icon={<Plus size={16} />} label="Add password" onClick={startAdd} />
            <QuickAction icon={<Sparkles size={16} />} label="Password generator" onClick={() => setScreen("generator")} />
            <QuickAction icon={<ShieldCheck size={16} />} label="Security health" onClick={() => setScreen("health")} />
          </div>

          {activeOrigin && (
            <div className="site-permission-card">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200">Current site</p>
                <p className="mt-1 truncate text-[11px] text-slate-400">{new URL(activeOrigin).hostname}</p>
              </div>
              {siteEnabled ? (
                <span className="secure-pill"><Check size={12} /> Enabled</span>
              ) : (
                <button className="secondary-button shrink-0" type="button" disabled={busy} onClick={() => void enableAutofill()}>Enable autofill</button>
              )}
              <button
                type="button"
                className="primary-button w-full"
                disabled={busy}
                onClick={() => void generateAndSaveForCurrentSite()}
              >
                <Sparkles size={14} /> {busy ? "Generating and saving…" : "Generate & save password"}
              </button>
              <p className="w-full text-[10px] leading-4 text-slate-500">Creates a new encrypted credential for this site; it does not replace existing entries or fill the website form.</p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">Recently saved</p>
              <button type="button" className="text-button" onClick={() => setScreen("list")}>View all <ArrowRight size={13} /></button>
            </div>
            <div className="space-y-2">
              {records.slice(0, 3).map((record) => (
                <button key={record.id} type="button" className="recent-item" onClick={() => void openRecord(record.id)}>
                  <Fingerprint size={16} className="text-blue-300" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-medium text-slate-100">{record.site}</span>
                    <span className="block truncate text-[10px] text-slate-400">{record.username || record.email || record.url}</span>
                  </span>
                  <ArrowRight size={14} className="text-slate-500" />
                </button>
              ))}
              {records.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">No passwords yet. Add one to get started.</p>}
            </div>
          </div>
        </section>
      )}

      {screen === "list" && (
        <PasswordList
          records={records}
          activeOrigin={activeOrigin}
          query={query}
          folder={folder}
          onQueryChange={setQuery}
          onFolderChange={setFolder}
          onOpen={(id) => void openRecord(id)}
          onFill={(id) => void request({ type: "fill-record", id }).then(() => setNotice("Credentials filled. The form was not submitted.")).catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Could not fill credentials."))}
          onAdd={startAdd}
        />
      )}

      {screen === "details" && selectedRecord && (
        <section className="space-y-4">
          <div className="detail-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{selectedRecord.site}</p>
                <a className="mt-1 block truncate text-xs text-blue-300 hover:text-blue-200" href={selectedRecord.url} target="_blank" rel="noreferrer">{selectedRecord.url}</a>
              </div>
              <span className={`strength strength-${selectedRecord.strength.toLowerCase()}`}>{selectedRecord.strength}</span>
            </div>
            <DetailRow label="Username" value={selectedRecord.username || selectedRecord.email || "Not set"} onCopy={() => void copyRecordField(selectedRecord.id, "username")} />
            <div className="detail-row">
              <span className="detail-label">Password</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{showDetailsPassword ? selectedRecord.password : "••••••••••••"}</span>
              <button className="text-button" type="button" onClick={() => setShowDetailsPassword((value) => !value)}>{showDetailsPassword ? "Hide" : "Show"}</button>
              <button className="text-button" type="button" onClick={() => void copyRecordField(selectedRecord.id, "password")} aria-label="Copy password"><Copy size={14} /></button>
            </div>
            <DetailRow label="Folder" value={selectedRecord.folder || "General"} />
            {selectedRecord.note && <div className="detail-note"><span className="detail-label">Notes</span><p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{selectedRecord.note}</p></div>}
            <p className="mt-4 text-[10px] text-slate-500">Updated {selectedRecord.updated}</p>
          </div>
          <button type="button" className="primary-button w-full" disabled={!activeOrigin || !siteEnabled || !recordMatchesOrigin(selectedRecord.url, activeOrigin)} onClick={() => void request({ type: "fill-record", id: selectedRecord.id }).then(() => setNotice("Credentials filled. The form was not submitted.")).catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Could not fill credentials."))}>
            <ShieldCheck size={15} /> Fill on matching website
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="secondary-button" onClick={startEdit}>Edit</button>
            <button type="button" className="danger-button" disabled={busy} onClick={() => void deleteRecord()}>Delete</button>
          </div>
        </section>
      )}

      {screen === "editor" && (
        <PasswordEditor
          key={`${editorId ?? "new"}-${editorRecord?.updated ?? "new"}`}
          initial={editorRecord}
          initialPassword={generatedPassword}
          busy={busy}
          onCancel={() => {
            if (selectedRecord && editorId) setScreen("details");
            else setScreen("list");
          }}
          onSave={saveRecord}
          onGenerate={(draft) => {
            setEditorRecord(draft);
            setScreen("generator");
          }}
        />
      )}

      {screen === "generator" && (
        <GeneratorPanel onCopy={copyText} onUse={useGeneratedPassword} />
      )}

      {screen === "health" && <HealthPanel metrics={health} />}

      {screen === "settings" && (
        <SettingsPanel
          settings={settings}
          onSave={saveSettings}
          onDisconnect={() => void disconnect()}
          onOpenWebsite={() => void chrome.tabs.create({ url: `${__JEFFTECH_APP_URL__}/settings` })}
        />
      )}

      <footer className="popup-footer">
        {screen !== "home" && (
          <button type="button" className="text-button" onClick={() => {
            if (screen === "details") setScreen("list");
            else if (screen === "editor" && selectedRecord && editorId) setScreen("details");
            else if (screen === "generator" && editorRecord) setScreen("editor");
            else setScreen("home");
          }}>
            <ArrowLeft size={13} /> Back
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <NavButton label="Vault" active={screen === "home" || screen === "list" || screen === "details" || screen === "editor"} onClick={() => setScreen("home")}><KeyRound size={15} /></NavButton>
          <NavButton label="Health" active={screen === "health"} onClick={() => setScreen("health")}><ShieldCheck size={15} /></NavButton>
          <NavButton label="Generator" active={screen === "generator"} onClick={() => { setEditorRecord(null); setEditorId(undefined); setScreen("generator"); }}><Sparkles size={15} /></NavButton>
          <NavButton label="Settings" active={screen === "settings"} onClick={() => setScreen("settings")}><Settings size={15} /></NavButton>
        </div>
      </footer>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="popup-header">
      <div className="flex items-center gap-3">
        <div className="brand-mark small"><ShieldCheck size={19} /></div>
        <div>
          <p className="eyebrow">Jefftech Security</p>
          <h1 className="text-base font-semibold text-white">{title}</h1>
        </div>
      </div>
      <CircleHelp size={17} className="text-slate-500" aria-label="Vault help" />
    </header>
  );
}

function Notice({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && <p role="alert" className="error-message">{error}</p>}
      {!error && notice && <p role="status" className="notice-message">{notice}</p>}
    </>
  );
}

function Metric({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-950/70 px-3 py-2">
      <p className={`text-lg font-semibold ${warning ? "text-amber-300" : "text-white"}`}>{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="quick-action" type="button" onClick={onClick}>
      <span className="quick-action-icon">{icon}</span>
      <span>{label}</span>
      <ArrowRight size={13} className="ml-auto text-slate-500" />
    </button>
  );
}

function DetailRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{value}</span>
      {onCopy && <button className="text-button" type="button" onClick={onCopy} aria-label={`Copy ${label}`}><Copy size={14} /></button>}
    </div>
  );
}

function NavButton({
  label, active, onClick, children,
}: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`nav-button ${active ? "nav-button-active" : ""}`} onClick={onClick} aria-label={label} title={label}>
      {children}<span>{label}</span>
    </button>
  );
}

function recordMatchesOrigin(recordUrl: string, origin: string) {
  try {
    return new URL(recordUrl).origin === origin;
  } catch {
    return false;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("The extension popup root is missing.");
createRoot(root).render(<PopupApp />);
