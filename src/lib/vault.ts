import {
  ARGON2ID_PARAMETERS,
  VAULT_ALGORITHM,
  bytesToBase64,
  decodeCanonicalBase64,
  decryptVaultBytes,
  deriveArgon2idKey,
  encryptVaultBytes,
  generateSecureRandomBytes,
} from "@/lib/security";
import type { PasswordRecord } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";

export type VaultItem = {
  id: string;
  revision: number;
  itemType: string;
  content: Record<string, unknown>;
};

export type PasswordVaultItem = PasswordRecord & {
  revision: number;
};

export type VaultKeyRow = {
  encrypted_vault_key: string;
  wrapped_key_nonce: string;
  salt: string;
  algorithm: string;
  kdf_algorithm: string;
  kdf_parameters: unknown;
  recovery_ciphertext: string;
  recovery_nonce: string;
};

export type EncryptedKeyEnvelope = {
  algorithm: typeof VAULT_ALGORITHM;
  key_version: string;
  kdf_algorithm: "Argon2id";
  kdf_parameters: typeof ARGON2ID_PARAMETERS;
  salt: string;
  ciphertext: string;
  nonce: string;
  recovery_ciphertext: string;
  recovery_nonce: string;
};

export type EncryptedItemEnvelope = {
  algorithm: typeof VAULT_ALGORITHM;
  key_version: string;
  nonce: string;
  ciphertext: string;
};

type VaultItemRow = {
  id: string;
  item_type: string;
  revision: number;
  encrypted_payload: EncryptedItemEnvelope;
};

export type PasswordRecordContent = Omit<PasswordRecord, "id">;
export type VaultItemContent = Record<string, unknown>;

export class VaultConflictError extends Error {
  constructor() {
    super("This vault item changed on another device.");
    this.name = "VaultConflictError";
  }
}

const LEGACY_STORAGE_KEY = "jefftech.passwordRecords";
const SUPPORTED_ITEM_TYPES = new Set([
  "password",
  "note",
  "identity",
  "card",
  "bank_account",
  "recovery_code",
  "license",
  "document",
]);
function encodeAad(parts: (string | number)[]) {
  return new TextEncoder().encode(JSON.stringify(["jefftech-vault", 1, ...parts]));
}

function keyWrapAad(userId: string, vaultId: string, keyVersion: string, purpose: "master" | "recovery") {
  return encodeAad(["vault-key", userId, vaultId, keyVersion, purpose]);
}

function itemAad(
  userId: string,
  vaultId: string,
  itemId: string,
  itemType: string,
  keyVersion: string,
  revision: number,
) {
  return encodeAad(["vault-item", userId, vaultId, itemId, itemType, keyVersion, revision]);
}

function validateVersion(version: string) {
  if (!/^v[1-9]\d*$/.test(version)) {
    throw new Error("Unsupported vault key version.");
  }
}

export function nextKeyVersion(version: string) {
  validateVersion(version);
  const parsed = Number(version.slice(1));
  if (!Number.isSafeInteger(parsed) || parsed >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Vault key version cannot be incremented safely.");
  }
  return `v${parsed + 1}`;
}

function validateKeyRow(row: VaultKeyRow, keyVersion: string) {
  validateVersion(keyVersion);
  const parameters = row.kdf_parameters as Record<string, unknown> | null;
  if (
    row.algorithm !== VAULT_ALGORITHM
    || row.kdf_algorithm !== "Argon2id"
    || !parameters
    || parameters.memoryKiB !== ARGON2ID_PARAMETERS.memoryKiB
    || parameters.iterations !== ARGON2ID_PARAMETERS.iterations
    || parameters.parallelism !== ARGON2ID_PARAMETERS.parallelism
    || parameters.hashLength !== ARGON2ID_PARAMETERS.hashLength
    || Object.keys(parameters).length !== 4
  ) {
    throw new Error("This vault uses an unsupported encryption configuration. Unlocking was stopped.");
  }

  decodeCanonicalBase64(row.salt, 16);
  decodeCanonicalBase64(row.wrapped_key_nonce, 12);
  decodeCanonicalBase64(row.recovery_nonce, 12);
  if (
    decodeCanonicalBase64(row.encrypted_vault_key).length !== 48
    || decodeCanonicalBase64(row.recovery_ciphertext).length !== 48
  ) {
    throw new Error("The encrypted vault key is invalid or truncated.");
  }
}

export function generateVaultKey() {
  return generateSecureRandomBytes(32);
}

export function generateRecoveryKey() {
  return generateSecureRandomBytes(32);
}

export async function createKeyEnvelope(
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
  masterPassword: string,
  recoveryKey: Uint8Array,
  salt = generateSecureRandomBytes(16),
): Promise<EncryptedKeyEnvelope> {
  validateVersion(keyVersion);
  if (vaultKey.length !== 32 || recoveryKey.length !== 32) {
    throw new Error("Vault and recovery keys must each be 256 bits.");
  }

  const { key: kek } = await deriveArgon2idKey(masterPassword, salt);
  try {
    const [masterWrap, recoveryWrap] = await Promise.all([
      encryptVaultBytes(
        vaultKey,
        kek,
        keyWrapAad(userId, vaultId, keyVersion, "master"),
        keyVersion,
      ),
      encryptVaultBytes(
        vaultKey,
        recoveryKey,
        keyWrapAad(userId, vaultId, keyVersion, "recovery"),
        keyVersion,
      ),
    ]);

    return {
      algorithm: VAULT_ALGORITHM,
      key_version: keyVersion,
      kdf_algorithm: "Argon2id",
      kdf_parameters: ARGON2ID_PARAMETERS,
      salt: bytesToBase64(salt),
      ciphertext: masterWrap.ciphertext,
      nonce: masterWrap.nonce,
      recovery_ciphertext: recoveryWrap.ciphertext,
      recovery_nonce: recoveryWrap.nonce,
    };
  } finally {
    kek.fill(0);
  }
}

export async function unwrapVaultKeyWithMasterPassword(
  userId: string,
  vaultId: string,
  keyVersion: string,
  row: VaultKeyRow,
  masterPassword: string,
) {
  validateKeyRow(row, keyVersion);
  const salt = decodeCanonicalBase64(row.salt, 16);
  const { key: kek } = await deriveArgon2idKey(masterPassword, salt);
  try {
    const vaultKey = await decryptVaultBytes(
      row.encrypted_vault_key,
      row.wrapped_key_nonce,
      kek,
      keyWrapAad(userId, vaultId, keyVersion, "master"),
    );
    if (vaultKey.length !== 32) {
      vaultKey.fill(0);
      throw new Error("The encrypted vault key is invalid.");
    }
    return vaultKey;
  } finally {
    kek.fill(0);
    salt.fill(0);
  }
}

export async function unwrapVaultKeyWithRecoveryKey(
  userId: string,
  vaultId: string,
  keyVersion: string,
  row: VaultKeyRow,
  recoveryKey: Uint8Array,
) {
  validateKeyRow(row, keyVersion);
  if (recoveryKey.length !== 32) {
    throw new Error("The recovery key must be 32 bytes.");
  }
  const vaultKey = await decryptVaultBytes(
    row.recovery_ciphertext,
    row.recovery_nonce,
    recoveryKey,
    keyWrapAad(userId, vaultId, keyVersion, "recovery"),
  );
  if (vaultKey.length !== 32) {
    vaultKey.fill(0);
    throw new Error("The recovery key is invalid.");
  }
  return vaultKey;
}

function isPasswordRecordContent(value: unknown): value is PasswordRecordContent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.site === "string"
    && typeof record.username === "string"
    && typeof record.password === "string"
    && typeof record.email === "string"
    && typeof record.url === "string"
    && typeof record.folder === "string"
    && typeof record.note === "string"
    && Array.isArray(record.tags)
    && record.tags.every((tag) => typeof tag === "string")
    && (record.strength === "Strong" || record.strength === "Medium" || record.strength === "Weak")
    && typeof record.updated === "string"
    && typeof record.created === "string"
    && (record.favorite === undefined || typeof record.favorite === "boolean")
    && (
      record.passwordHistory === undefined
      || (
        Array.isArray(record.passwordHistory)
        && record.passwordHistory.length <= 20
        && record.passwordHistory.every((entry) => (
          typeof entry === "object"
          && entry !== null
          && typeof (entry as Record<string, unknown>).password === "string"
          && typeof (entry as Record<string, unknown>).changedAt === "string"
        ))
      )
    );
}

export async function encryptVaultItem(
  content: VaultItemContent,
  itemType: string,
  userId: string,
  vaultId: string,
  itemId: string,
  keyVersion: string,
  revision: number,
  vaultKey: Uint8Array,
): Promise<EncryptedItemEnvelope> {
  validateVersion(keyVersion);
  if (!SUPPORTED_ITEM_TYPES.has(itemType) || typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new Error("Unsupported vault item content.");
  }
  if (itemType === "password" && !isPasswordRecordContent(content)) {
    throw new Error("Password records have an invalid payload.");
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(content));
  try {
    const encrypted = await encryptVaultBytes(
      plaintext,
      vaultKey,
      itemAad(userId, vaultId, itemId, itemType, keyVersion, revision),
      keyVersion,
    );
    return {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      algorithm: encrypted.algorithm,
      key_version: encrypted.keyVersion,
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptVaultItem(
  row: VaultItemRow,
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
): Promise<VaultItem> {
  if (
    !SUPPORTED_ITEM_TYPES.has(row.item_type)
    || !Number.isSafeInteger(row.revision)
    || row.revision < 1
    || row.encrypted_payload?.algorithm !== VAULT_ALGORITHM
    || row.encrypted_payload.key_version !== keyVersion
  ) {
    throw new Error("A vault item has unsupported or downgraded encryption metadata.");
  }
  const plaintext = await decryptVaultBytes(
    row.encrypted_payload.ciphertext,
    row.encrypted_payload.nonce,
    vaultKey,
    itemAad(userId, vaultId, row.id, row.item_type, keyVersion, row.revision),
  );
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || (row.item_type === "password" && !isPasswordRecordContent(value))
    ) {
      throw new Error("A vault item has an invalid encrypted payload.");
    }
    return { id: row.id, revision: row.revision, itemType: row.item_type, content: value as Record<string, unknown> };
  } catch {
    throw new Error("A vault item could not be authenticated or decoded.");
  } finally {
    plaintext.fill(0);
  }
}

export async function loadEncryptedVaultRecords(
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
) {
  const client = createClient();
  const records: VaultItem[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("vault_items")
      .select("id,item_type,revision,encrypted_payload")
      .eq("vault_id", vaultId)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`Unable to load encrypted vault items: ${error.message}`);
    }

    const rows = data as VaultItemRow[];
    for (const row of rows) {
      records.push(await decryptVaultItem(row, userId, vaultId, keyVersion, vaultKey));
    }
    if (rows.length < pageSize) {
      return records;
    }
  }
}

export async function saveEncryptedVaultItem(
  content: VaultItemContent,
  itemType: string,
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
  id: string,
  expectedRevision: number | null,
) {
  const revision = (expectedRevision ?? 0) + 1;
  const envelope = await encryptVaultItem(
    content,
    itemType,
    userId,
    vaultId,
    id,
    keyVersion,
    revision,
    vaultKey,
  );
  const { data, error } = await createClient().rpc("save_encrypted_vault_item", {
    p_vault_id: vaultId,
    p_item_id: id,
    p_item_type: itemType,
    p_key_version: keyVersion,
    p_nonce: envelope.nonce,
    p_ciphertext: envelope.ciphertext,
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (/changed|revision/i.test(error.message)) {
      throw new VaultConflictError();
    }
    throw new Error(`Unable to save the encrypted vault item: ${error.message}`);
  }
  if (data !== revision) {
    throw new Error("The vault returned an unexpected record revision.");
  }
  return revision;
}

export async function saveEncryptedPasswordRecord(
  record: PasswordRecordContent,
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
  id: string,
  expectedRevision: number | null,
) {
  return saveEncryptedVaultItem(
    record,
    "password",
    userId,
    vaultId,
    keyVersion,
    vaultKey,
    id,
    expectedRevision,
  );
}

export async function deleteEncryptedPasswordRecord(vaultId: string, itemId: string, revision: number) {
  const { error } = await createClient().rpc("delete_encrypted_vault_item", {
    p_vault_id: vaultId,
    p_item_id: itemId,
    p_expected_revision: revision,
  });
  if (error) {
    if (/changed|revision/i.test(error.message)) {
      throw new VaultConflictError();
    }
    throw new Error(`Unable to delete the encrypted vault item: ${error.message}`);
  }
}

export function parseRecoveryKey(value: string) {
  return decodeCanonicalBase64(value.trim(), 32);
}

export function encodeRecoveryKey(value: Uint8Array) {
  if (value.length !== 32) {
    throw new Error("The recovery key must be 32 bytes.");
  }
  return bytesToBase64(value);
}

export function legacyPasswordStorageKey() {
  return LEGACY_STORAGE_KEY;
}

export function parseLegacyPasswordRecords(value: string): PasswordRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Old browser-stored credentials are not valid JSON and could not be imported safely.");
  }
  if (!Array.isArray(parsed) || parsed.some((record) => (
    !isPasswordRecordContent(record)
    || typeof (record as Record<string, unknown>).id !== "string"
  ))) {
    throw new Error("Old browser-stored credentials have an unsupported format and could not be imported safely.");
  }
  return parsed as PasswordRecord[];
}

export async function migrateLegacyPasswordRecords(
  legacyRecords: PasswordRecord[],
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
) {
  if (legacyRecords.length === 0) {
    return;
  }

  const client = createClient();
  const legacyIds = legacyRecords.map((record) => record.id);
  const ids = await Promise.all(legacyIds.map(async (legacyId, index) => {
    const digest = new Uint8Array(await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`jefftech-legacy-v1:${userId}:${legacyId}:${index}`),
    ));
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }));
  const { data: existingRows, error } = await client
    .from("vault_items")
    .select("id")
    .eq("vault_id", vaultId)
    .in("id", ids);
  if (error) {
    throw new Error(`Unable to check previously imported browser credentials: ${error.message}`);
  }
  const existingIds = new Set((existingRows as { id: string }[]).map((row) => row.id));

  for (let index = 0; index < legacyRecords.length; index += 1) {
    const record = legacyRecords[index];
    const id = ids[index];
    if (existingIds.has(id)) {
      continue;
    }
    const content = {
      site: record.site,
      username: record.username,
      password: record.password,
      email: record.email,
      url: record.url,
      folder: record.folder,
      note: record.note,
      tags: record.tags,
      strength: record.strength,
      updated: record.updated,
      created: record.created,
    };
    await saveEncryptedPasswordRecord(content, userId, vaultId, keyVersion, vaultKey, id, null);
  }
}

export function createPasswordRecordContent(
  content: Omit<PasswordRecordContent, "strength" | "created" | "updated">,
  existing?: PasswordVaultItem,
): PasswordRecordContent {
  const now = new Date().toISOString().slice(0, 10);
  const history = existing?.passwordHistory ?? [];
  const passwordHistory = existing && existing.password !== content.password
    ? [...history, { password: existing.password, changedAt: now }].slice(-20)
    : history;
  return {
    ...content,
    strength: content.password.length >= 14 ? "Strong" : content.password.length >= 10 ? "Medium" : "Weak",
    created: existing?.created ?? now,
    updated: now,
    favorite: content.favorite ?? existing?.favorite ?? false,
    passwordHistory,
  };
}

export function toPasswordVaultItem(item: VaultItem): PasswordVaultItem | null {
  if (item.itemType !== "password" || !isPasswordRecordContent(item.content)) {
    return null;
  }
  return { ...item.content, id: item.id, revision: item.revision };
}
