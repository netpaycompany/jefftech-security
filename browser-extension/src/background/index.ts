import { z } from "zod";

import {
  decryptPassword,
  encryptPassword,
  unwrapVaultKey,
} from "../crypto/vault-crypto";
import {
  connectAccount,
  deleteEncryptedPassword,
  disconnectAccount,
  getAuthorizationState,
  getPasswordRows,
  getSettings,
  getVaultEnvelope,
  saveEncryptedPassword,
  saveSettings,
  validateExtensionSession,
} from "../services/backend";
import type { PasswordRecord, PasswordSummary, VaultPassword } from "../types";
import { analyzePasswords, originMatches, passwordStrength } from "../utils/security";
import { contentMessageSchema, popupMessageSchema } from "../utils/messages";

let vaultKey: Uint8Array | null = null;
let vaultId: string | null = null;
let keyVersion: string | null = null;
let activeUserId: string | null = null;
let records = new Map<string, VaultPassword>();
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

function clearRecords() {
  for (const record of records.values()) {
    record.site = "";
    record.url = "";
    record.password = "";
    record.username = "";
    record.email = "";
    record.note = "";
    record.folder = "";
    record.tags = [];
    record.passwordHistory = [];
  }
  records.clear();
}

async function fillRecordOnActiveTab(id: string) {
  await requireActiveSession();
  const record = records.get(id);
  if (!record) throw new Error("Password record not found.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !originMatches(record.url, tab.url)) {
    throw new Error("Autofill blocked: this credential is not for the active website origin.");
  }
  const origin = new URL(tab.url).origin;
  if (!await chrome.permissions.contains({ origins: [patternForUrl(origin)] })) {
    throw new Error("Enable autofill for this website before filling credentials.");
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "jefftech:approved-fill",
      username: record.username || record.email,
      password: record.password,
    }, { frameId: 0 });
  } catch {
    throw new Error("Reload the website tab and try autofill again.");
  }
  await touchVault();
  return { filled: true };
}

function lockVault() {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  autoLockTimer = null;
  vaultKey?.fill(0);
  vaultKey = null;
  vaultId = null;
  keyVersion = null;
  activeUserId = null;
  clearRecords();
}

async function touchVault() {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  const settings = await getSettings();
  autoLockTimer = setTimeout(lockVault, settings.autoLockMinutes * 60_000);
}

function requireUnlocked() {
  if (!vaultKey || !vaultId || !keyVersion || !activeUserId) {
    throw new Error("Unlock the vault first.");
  }
  return { vaultKey, vaultId, keyVersion, activeUserId };
}

async function requireActiveSession() {
  requireUnlocked();
  try {
    await validateExtensionSession();
  } catch (error) {
    lockVault();
    const message = error instanceof Error ? error.message : "The server could not verify the extension session.";
    throw new Error(`Vault locked because its session could not be verified. ${message}`);
  }
  return requireUnlocked();
}

function patternForUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Autofill is available only on HTTPS websites.");
  return `https://${url.hostname}/*`;
}

function trustedContentSender(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0 || !sender.url || !sender.tab.url) {
    return false;
  }
  try {
    const source = new URL(sender.url);
    const tab = new URL(sender.tab.url);
    return source.protocol === "https:" && source.origin === tab.origin;
  } catch {
    return false;
  }
}

function trustedPopupSender(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("popup.html");
}

function summarize(record: VaultPassword): PasswordSummary {
  const { password: _password, note: _note, passwordHistory: _history, ...summary } = record;
  return summary;
}

async function loadUnlockedRecords(key: Uint8Array, userId: string, activeVaultId: string, version: string) {
  const rows = await getPasswordRows();
  const next = new Map<string, VaultPassword>();
  try {
    for (const row of rows) {
      const record = await decryptPassword(row, userId, activeVaultId, version, key);
      next.set(record.id, record);
    }
    return next;
  } catch (error) {
    for (const record of next.values()) {
      record.password = "";
      record.username = "";
      record.email = "";
      record.note = "";
      record.passwordHistory = [];
    }
    next.clear();
    throw error;
  }
}

async function unlock(masterPassword: string) {
  lockVault();
  let unwrapped: Uint8Array | null = null;
  try {
    const envelope = await getVaultEnvelope();
    const authorization = await getAuthorizationState();
    if (!authorization.authenticated) throw new Error("Connect your Jefftech account again.");
    const tokens = await chrome.storage.session.get("extension.tokens");
    const userId = (tokens["extension.tokens"] as { profileId?: string } | undefined)?.profileId;
    if (!userId || typeof userId !== "string") {
      throw new Error("The extension account could not be verified. Connect again.");
    }

    unwrapped = await unwrapVaultKey(envelope, userId, masterPassword);
    const loaded = await loadUnlockedRecords(unwrapped, userId, envelope.vault_id, envelope.key_version);
    vaultKey = unwrapped;
    unwrapped = null;
    activeUserId = userId;
    vaultId = envelope.vault_id;
    keyVersion = envelope.key_version;
    records = loaded;
    await touchVault();
    return { unlocked: true, count: records.size };
  } catch (error) {
    unwrapped?.fill(0);
    lockVault();
    throw error;
  }
}

async function listPasswords() {
  await requireActiveSession();
  await touchVault();
  return [...records.values()].map(summarize);
}

async function getPassword(id: string) {
  await requireActiveSession();
  await touchVault();
  const record = records.get(id);
  if (!record) throw new Error("Password record not found.");
  return { ...record };
}

function validateRecordUrl(record: PasswordRecord) {
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    throw new Error("Enter a valid website URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Password records must use an HTTPS website URL without embedded credentials.");
  }
  return url.origin;
}

async function savePassword(input: { id?: string; record: PasswordRecord }) {
  await requireActiveSession();
  const { vaultKey: key, vaultId: activeVaultId, keyVersion: version, activeUserId: userId } = requireUnlocked();
  const origin = validateRecordUrl(input.record);
  if (!input.record.site.trim() || input.record.site.length > 200) {
    throw new Error("Enter a website name of 1–200 characters.");
  }
  const id = input.id ?? crypto.randomUUID();
  const previous = records.get(id);
  if (input.id && !previous) throw new Error("Password record not found.");
  if (previous && !originMatches(previous.url, origin)) {
    throw new Error("A password record cannot be moved to a different website origin.");
  }

  const now = new Date().toISOString().slice(0, 10);
  const passwordHistory = previous && previous.password !== input.record.password
    ? [...previous.passwordHistory, { password: previous.password, changedAt: now }].slice(-20)
    : input.record.passwordHistory;
  const record: PasswordRecord = {
    ...input.record,
    site: input.record.site.trim(),
    url: origin,
    folder: input.record.folder.trim() || "General",
    strength: passwordStrength(input.record.password),
    created: previous?.created ?? now,
    updated: now,
    favorite: input.record.favorite ?? false,
    passwordHistory,
  };
  const revision = (previous?.revision ?? 0) + 1;
  const encrypted = await encryptPassword(record, userId, activeVaultId, id, version, revision, key);
  const savedRevision = await saveEncryptedPassword({
    id,
    keyVersion: version,
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    expectedRevision: previous?.revision ?? null,
  });
  if (savedRevision !== revision) throw new Error("The server returned an unexpected password revision.");
  records.set(id, { ...record, id, revision });
  await touchVault();
  return { id, revision };
}

async function removePassword(id: string, revision: number) {
  await requireActiveSession();
  await deleteEncryptedPassword(id, revision);
  const record = records.get(id);
  if (record) {
    record.site = "";
    record.url = "";
    record.password = "";
    record.username = "";
    record.email = "";
    record.note = "";
    record.folder = "";
    record.tags = [];
    record.passwordHistory = [];
  }
  records.delete(id);
  await touchVault();
}

async function getHealth() {
  await requireActiveSession();
  await touchVault();
  return analyzePasswords([...records.values()]);
}

async function getState() {
  try {
    const authorization = await getAuthorizationState();
    if (!authorization.authenticated) lockVault();
    return {
      authenticated: authorization.authenticated,
      unlocked: Boolean(vaultKey),
      count: vaultKey ? records.size : 0,
    };
  } catch (error) {
    lockVault();
    throw error;
  }
}

async function handlePopupMessage(message: z.infer<typeof popupMessageSchema>) {
  switch (message.type) {
    case "connect":
      await connectAccount();
      return getState();
    case "disconnect":
      lockVault();
      await disconnectAccount();
      return getState();
    case "state":
      return getState();
    case "unlock":
      return unlock(message.masterPassword);
    case "lock":
      lockVault();
      return getState();
    case "list":
      return listPasswords();
    case "fill-record":
      return fillRecordOnActiveTab(message.id);
    case "get-record":
      return getPassword(message.id);
    case "save-record":
      return savePassword(message);
    case "delete-record":
      return removePassword(message.id, message.revision);
    case "health":
      return getHealth();
    case "settings":
      return getSettings();
    case "save-settings":
      await saveSettings(message.settings);
      if (vaultKey) await touchVault();
      return message.settings;
    case "clipboard-copy": {
      const record = await getPassword(message.id);
      return message.field === "username" ? record.username : record.password;
    }
  }
}

async function handleContentMessage(
  message: z.infer<typeof contentMessageSchema>,
  sender: chrome.runtime.MessageSender,
) {
  if (!trustedContentSender(sender)) throw new Error("The website context is not trusted.");
  const origin = new URL(sender.url!).origin;
  if (!await chrome.permissions.contains({ origins: [patternForUrl(origin)] })) {
    throw new Error("Enable autofill for this website from the extension popup first.");
  }

  if (message.type === "content:check") {
    return { enabled: true };
  }

  if (message.type === "content:scan") {
    if (!vaultKey) return { unlocked: false, matches: [] };
    await requireActiveSession();
    await touchVault();
    const matches = [...records.values()]
      .filter((record) => originMatches(record.url, origin))
      .map(({ id, site, username, email }) => ({ id, site, username: username || email }));
    return { unlocked: true, matches };
  }

  if (message.type === "content:fill") {
    await requireActiveSession();
    const record = records.get(message.id);
    if (!record || !originMatches(record.url, origin)) {
      throw new Error("Autofill blocked: this credential does not match the current website origin.");
    }
    await chrome.tabs.sendMessage(sender.tab!.id!, {
      type: "jefftech:approved-fill",
      username: record.username || record.email,
      password: record.password,
    }, { frameId: 0 });
    await touchVault();
    return { filled: true };
  }

  const candidateUrl = new URL(message.url);
  if (candidateUrl.protocol !== "https:" || candidateUrl.origin !== origin) {
    throw new Error("The submitted login does not match this trusted website origin.");
  }
  const matching = message.username.trim() ? [...records.values()].find((record) => (
    originMatches(record.url, origin)
    && (record.username || record.email).toLocaleLowerCase() === message.username.toLocaleLowerCase()
  )) : undefined;
  const base = matching ?? {
    site: candidateUrl.hostname,
    url: candidateUrl.origin,
    username: message.username,
    password: message.password,
    email: "",
    folder: "General",
    note: "",
    tags: [],
    strength: passwordStrength(message.password),
    created: new Date().toISOString().slice(0, 10),
    updated: new Date().toISOString().slice(0, 10),
    favorite: false,
    passwordHistory: [],
  } satisfies PasswordRecord;
  return savePassword({ id: matching?.id, record: { ...base, password: message.password, username: message.username } });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const popupMessage = popupMessageSchema.safeParse(message);
  const contentMessage = contentMessageSchema.safeParse(message);
  if (popupMessage.success) {
    if (!trustedPopupSender(sender)) {
      sendResponse({ ok: false, error: "This action is available only from the Jefftech extension popup." });
      return false;
    }
    void handlePopupMessage(popupMessage.data)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The extension action failed.",
      }));
    return true;
  }
  if (contentMessage.success) {
    void handleContentMessage(contentMessage.data, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The website action failed.",
      }));
    return true;
  }
  sendResponse({ ok: false, error: "The extension rejected an invalid message." });
  return false;
});
