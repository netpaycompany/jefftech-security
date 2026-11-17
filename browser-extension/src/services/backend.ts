import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ExtensionSettings, ExtensionTokens, VaultKeyEnvelope } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { randomBytes } from "../crypto/vault-crypto";
import { createPkcePair } from "../utils/security";

declare const __JEFFTECH_APP_URL__: string;

const TOKEN_STORAGE_KEY = "extension.tokens";
const PKCE_STORAGE_KEY = "extension.pkce";
const SETTINGS_STORAGE_KEY = "extension.settings";

type PendingPkce = { verifier: string; state: string; redirectUri: string };

let refreshInFlight: Promise<ExtensionTokens> | null = null;

function isPendingPkce(value: unknown): value is PendingPkce {
  if (typeof value !== "object" || value === null) return false;
  const pending = value as Record<string, unknown>;
  return typeof pending.verifier === "string"
    && /^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier)
    && typeof pending.state === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(pending.state)
    && typeof pending.redirectUri === "string";
}

function isExtensionTokens(value: unknown): value is ExtensionTokens {
  if (typeof value !== "object" || value === null) return false;
  const tokens = value as Record<string, unknown>;
  return typeof tokens.profileId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tokens.profileId)
    && typeof tokens.accessToken === "string"
    && /^[0-9a-f]{64}$/.test(tokens.accessToken)
    && typeof tokens.refreshToken === "string"
    && /^[0-9a-f]{64}$/.test(tokens.refreshToken)
    && Number.isSafeInteger(tokens.accessExpiresAt)
    && Number.isSafeInteger(tokens.refreshExpiresAt)
    && (tokens.accessExpiresAt as number) < (tokens.refreshExpiresAt as number);
}

function parseTokenResponse(value: unknown): ExtensionTokens {
  if (typeof value !== "object" || value === null) {
    throw new Error("The authorization server returned an invalid session.");
  }
  const result = value as Record<string, unknown>;
  const tokens: ExtensionTokens = {
    profileId: typeof result.profile_id === "string" ? result.profile_id : "",
    accessToken: typeof result.access_token === "string" ? result.access_token : "",
    refreshToken: typeof result.refresh_token === "string" ? result.refresh_token : "",
    accessExpiresAt: typeof result.access_expires_at === "string" ? Date.parse(result.access_expires_at) : Number.NaN,
    refreshExpiresAt: typeof result.refresh_expires_at === "string" ? Date.parse(result.refresh_expires_at) : Number.NaN,
  };
  if (!isExtensionTokens(tokens) || tokens.refreshExpiresAt <= Date.now()) {
    throw new Error("The authorization server returned an invalid or expired session.");
  }
  return tokens;
}

let client: SupabaseClient | null = null;

async function getClient() {
  if (!client) {
    const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured in this extension build.");
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

async function getTokens() {
  const { [TOKEN_STORAGE_KEY]: tokens } = await chrome.storage.session.get(TOKEN_STORAGE_KEY);
  if (tokens === undefined) return null;
  if (!isExtensionTokens(tokens)) {
    await removeTokens();
    throw new Error("The stored extension session is invalid. Connect your account again.");
  }
  return tokens;
}

async function saveTokens(result: unknown) {
  const tokens = parseTokenResponse(result);
  await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: tokens });
  return tokens;
}

async function removeTokens() {
  await chrome.storage.session.remove(TOKEN_STORAGE_KEY);
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function refresh(tokens: ExtensionTokens) {
  if (tokens.refreshExpiresAt <= Date.now()) {
    await removeTokens();
    throw new Error("Your extension session expired. Connect your Jefftech account again.");
  }
  try {
    const data = await rpc<unknown>("refresh_extension_session", {
      p_refresh_token: tokens.refreshToken,
    });
    const next = Array.isArray(data) ? data[0] : undefined;
    return await saveTokens(next);
  } catch (error) {
    await removeTokens();
    throw error instanceof Error ? error : new Error("Your extension session expired. Connect again.");
  }
}

function refreshOnce(tokens: ExtensionTokens) {
  if (!refreshInFlight) {
    refreshInFlight = refresh(tokens).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function requireAccessToken() {
  const tokens = await getTokens();
  if (!tokens) throw new Error("Connect your Jefftech account first.");
  if (tokens.accessExpiresAt > Date.now() + 30_000) return tokens.accessToken;
  return (await refreshOnce(tokens)).accessToken;
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function callbackMatches(actual: URL, expected: URL) {
  return actual.origin === expected.origin && actual.pathname === expected.pathname;
}

export async function connectAccount() {
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await removeTokens();
  const { verifier, challenge } = await createPkcePair();
  const state = base64Url(randomBytes(32));
  const redirectUri = chrome.identity.getRedirectURL();
  await chrome.storage.session.set({ [PKCE_STORAGE_KEY]: { verifier, state, redirectUri } });

  const authorizationUrl = new URL("/extension/authorize", __JEFFTECH_APP_URL__);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  try {
    const callback = await chrome.identity.launchWebAuthFlow({
      url: authorizationUrl.toString(),
      interactive: true,
    });
    if (!callback) throw new Error("Jefftech authorization was cancelled.");
    const returned = new URL(callback);
    const expected = new URL(redirectUri);
    if (!callbackMatches(returned, expected)) throw new Error("The authorization returned to an unexpected destination.");

    const stored = await chrome.storage.session.get(PKCE_STORAGE_KEY);
    const pending: unknown = stored[PKCE_STORAGE_KEY];
    if (!isPendingPkce(pending) || pending.redirectUri !== redirectUri
      || returned.searchParams.get("state") !== pending.state) {
      throw new Error("The extension authorization state could not be verified.");
    }
    const authorizationError = returned.searchParams.get("error");
    if (authorizationError) {
      throw new Error(authorizationError === "access_denied"
        ? "You cancelled the Jefftech extension authorization."
        : "Jefftech could not authorize this extension.");
    }
    const code = returned.searchParams.get("code");
    if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
      throw new Error("The website did not return a valid one-time authorization code.");
    }
    const data = await rpc<unknown>("exchange_extension_authorization", {
      p_code: code,
      p_code_verifier: pending.verifier,
    });
    const session = Array.isArray(data) ? data[0] : undefined;
    await saveTokens(session);
  } finally {
    await chrome.storage.session.remove(PKCE_STORAGE_KEY);
  }
}

export async function disconnectAccount() {
  const tokens = await getTokens();
  if (tokens) {
    try {
      await rpc("revoke_extension_session", { p_refresh_token: tokens.refreshToken });
    } finally {
      await removeTokens();
    }
  } else {
    await removeTokens();
  }
}

export async function getAuthorizationState() {
  const tokens = await getTokens();
  if (!tokens) return { authenticated: false };
  await validateExtensionSession();
  return { authenticated: true };
}

export async function validateExtensionSession() {
  const accessToken = await requireAccessToken();
  const valid = await rpc<boolean>("validate_extension_session", { p_access_token: accessToken });
  if (valid !== true) {
    await removeTokens();
    throw new Error("Your extension session was revoked or expired. Connect your Jefftech account again.");
  }
}

export async function getVaultEnvelope() {
  const accessToken = await requireAccessToken();
  const rows = await rpc<VaultKeyEnvelope[]>("get_extension_vault", { p_access_token: accessToken });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("The signed-in account does not have a configured default vault.");
  }
  return rows[0];
}

export async function getPasswordRows() {
  const accessToken = await requireAccessToken();
  const rows = await rpc<Array<{ id: string; revision: number; encrypted_payload: unknown }>>(
    "list_extension_passwords",
    { p_access_token: accessToken },
  );
  if (!Array.isArray(rows)) throw new Error("The vault returned invalid password records.");
  return rows;
}

export async function saveEncryptedPassword(
  input: {
    id: string;
    keyVersion: string;
    nonce: string;
    ciphertext: string;
    expectedRevision: number | null;
  },
) {
  const accessToken = await requireAccessToken();
  return rpc<number>("save_extension_password", {
    p_access_token: accessToken,
    p_item_id: input.id,
    p_key_version: input.keyVersion,
    p_nonce: input.nonce,
    p_ciphertext: input.ciphertext,
    p_expected_revision: input.expectedRevision,
  });
}

export async function deleteEncryptedPassword(id: string, revision: number) {
  const accessToken = await requireAccessToken();
  return rpc("delete_extension_password", {
    p_access_token: accessToken,
    p_item_id: id,
    p_expected_revision: revision,
  });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const { [SETTINGS_STORAGE_KEY]: stored } = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  if (typeof stored !== "object" || stored === null) return DEFAULT_SETTINGS;
  const values = stored as Partial<ExtensionSettings>;
  return {
    autoLockMinutes: Number.isInteger(values.autoLockMinutes) && values.autoLockMinutes! >= 1 && values.autoLockMinutes! <= 60
      ? values.autoLockMinutes!
      : DEFAULT_SETTINGS.autoLockMinutes,
    clipboardClearSeconds: Number.isInteger(values.clipboardClearSeconds) && values.clipboardClearSeconds! >= 0 && values.clipboardClearSeconds! <= 120
      ? values.clipboardClearSeconds!
      : DEFAULT_SETTINGS.clipboardClearSeconds,
  };
}

export async function saveSettings(settings: ExtensionSettings) {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}
