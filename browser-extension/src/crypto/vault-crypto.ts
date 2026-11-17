import { argon2id } from "hash-wasm";
import type { PasswordRecord, VaultKeyEnvelope } from "../types";

export const VAULT_ALGORITHM = "AES-256-GCM";
export const KDF_PARAMETERS = {
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

function copyBuffer(value: Uint8Array) {
  const copy = new Uint8Array(value.length);
  copy.set(value);
  return copy.buffer;
}

function clearBuffer(value: ArrayBuffer) {
  new Uint8Array(value).fill(0);
}

async function importAesKey(key: Uint8Array, usage: KeyUsage[]) {
  const rawKey = copyBuffer(key);
  try {
    return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, usage);
  } finally {
    clearBuffer(rawKey);
  }
}

export function randomBytes(length: number) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 65_536) {
    throw new RangeError("Invalid secure random byte count.");
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

export function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string, expectedLength?: number) {
  if (value.length > 5_592_408
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Encrypted data has an invalid encoding.");
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if ((expectedLength !== undefined && bytes.length !== expectedLength) || encodeBase64(bytes) !== value) {
    bytes.fill(0);
    throw new Error("Encrypted data has an invalid length or encoding.");
  }
  return bytes;
}

function aad(parts: (string | number)[]) {
  return new TextEncoder().encode(JSON.stringify(["jefftech-vault", 1, ...parts]));
}

function keyAad(userId: string, vaultId: string, keyVersion: string) {
  return aad(["vault-key", userId, vaultId, keyVersion, "master"]);
}

function itemAad(
  userId: string,
  vaultId: string,
  itemId: string,
  keyVersion: string,
  revision: number,
) {
  return aad(["vault-item", userId, vaultId, itemId, "password", keyVersion, revision]);
}

export function isPasswordRecord(value: unknown): value is PasswordRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.site === "string"
    && typeof record.url === "string"
    && typeof record.username === "string"
    && typeof record.password === "string"
    && typeof record.email === "string"
    && typeof record.folder === "string"
    && typeof record.note === "string"
    && Array.isArray(record.tags)
    && record.tags.every((tag) => typeof tag === "string")
    && (record.strength === "Strong" || record.strength === "Medium" || record.strength === "Weak")
    && typeof record.created === "string"
    && typeof record.updated === "string"
    && (record.favorite === undefined || typeof record.favorite === "boolean")
    && (record.passwordHistory === undefined || (
      Array.isArray(record.passwordHistory)
      && record.passwordHistory.length <= 20
      && record.passwordHistory.every((entry) => (
      typeof entry === "object" && entry !== null
      && typeof (entry as Record<string, unknown>).password === "string"
      && typeof (entry as Record<string, unknown>).changedAt === "string"
      ))
    ));
}

function validateEnvelope(envelope: VaultKeyEnvelope) {
  const parameters = envelope.kdf_parameters as Record<string, unknown> | null;
  if (!/^v[1-9]\d*$/.test(envelope.key_version)
    || envelope.algorithm !== VAULT_ALGORITHM
    || envelope.kdf_algorithm !== "Argon2id"
    || !parameters
    || parameters.memoryKiB !== KDF_PARAMETERS.memoryKiB
    || parameters.iterations !== KDF_PARAMETERS.iterations
    || parameters.parallelism !== KDF_PARAMETERS.parallelism
    || parameters.hashLength !== KDF_PARAMETERS.hashLength
    || Object.keys(parameters).length !== 4) {
    throw new Error("This vault uses an unsupported encryption configuration.");
  }
  decodeBase64(envelope.salt, 16).fill(0);
  decodeBase64(envelope.wrapped_key_nonce, 12).fill(0);
  const wrappedKey = decodeBase64(envelope.encrypted_vault_key);
  if (wrappedKey.length !== 48) {
    wrappedKey.fill(0);
    throw new Error("The encrypted vault key is invalid or truncated.");
  }
  wrappedKey.fill(0);
}

export async function unwrapVaultKey(
  envelope: VaultKeyEnvelope,
  userId: string,
  masterPassword: string,
) {
  if (!masterPassword) throw new Error("Enter your vault master password.");
  validateEnvelope(envelope);
  const salt = decodeBase64(envelope.salt, 16);
  let derivedKey: Uint8Array | undefined;
  let wrappedKey: Uint8Array | undefined;
  try {
    const derivedHex = await argon2id({
      password: masterPassword,
      salt,
      iterations: KDF_PARAMETERS.iterations,
      memorySize: KDF_PARAMETERS.memoryKiB,
      parallelism: KDF_PARAMETERS.parallelism,
      hashLength: KDF_PARAMETERS.hashLength,
      outputType: "hex",
      type: "argon2id",
    });
    derivedKey = Uint8Array.from(derivedHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
    const cryptoKey = await importAesKey(derivedKey, ["decrypt"]);
    wrappedKey = decodeBase64(envelope.encrypted_vault_key);
    const nonce = decodeBase64(envelope.wrapped_key_nonce, 12);
    const iv = copyBuffer(nonce);
    const additionalData = copyBuffer(keyAad(userId, envelope.vault_id, envelope.key_version));
    const encryptedKey = copyBuffer(wrappedKey);
    try {
      const key = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData, tagLength: 128 },
        cryptoKey,
        encryptedKey,
      ));
      if (key.length !== 32) {
        key.fill(0);
        throw new Error("The encrypted vault key has an invalid length.");
      }
      return key;
    } finally {
      nonce.fill(0);
      clearBuffer(iv);
      clearBuffer(additionalData);
      clearBuffer(encryptedKey);
    }
  } finally {
    salt.fill(0);
    derivedKey?.fill(0);
    wrappedKey?.fill(0);
  }
}

export async function decryptPassword(
  row: { id: string; revision: number; encrypted_payload: unknown },
  userId: string,
  vaultId: string,
  keyVersion: string,
  vaultKey: Uint8Array,
) {
  const envelope = row.encrypted_payload as Record<string, unknown> | null;
  if (!envelope || !Number.isSafeInteger(row.revision) || row.revision < 1
    || envelope.algorithm !== VAULT_ALGORITHM || envelope.key_version !== keyVersion
    || typeof envelope.nonce !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error("A vault item has unsupported or downgraded encryption metadata.");
  }
  const nonce = decodeBase64(envelope.nonce, 12);
  const ciphertext = decodeBase64(envelope.ciphertext);
  let plaintext: Uint8Array | undefined;
  try {
    const cryptoKey = await importAesKey(vaultKey, ["decrypt"]);
    const iv = copyBuffer(nonce);
    const additionalData = copyBuffer(itemAad(userId, vaultId, row.id, keyVersion, row.revision));
    const encryptedPayload = copyBuffer(ciphertext);
    try {
      plaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData, tagLength: 128 },
        cryptoKey,
        encryptedPayload,
      ));
    } finally {
      clearBuffer(iv);
      clearBuffer(additionalData);
      clearBuffer(encryptedPayload);
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    if (!isPasswordRecord(parsed)) throw new Error("The password record has an invalid payload.");
    return {
      ...parsed,
      favorite: parsed.favorite ?? false,
      passwordHistory: parsed.passwordHistory ?? [],
      id: row.id,
      revision: row.revision,
    };
  } catch {
    throw new Error("A password record could not be authenticated or decoded.");
  } finally {
    nonce.fill(0);
    ciphertext.fill(0);
    plaintext?.fill(0);
  }
}

export async function encryptPassword(
  record: PasswordRecord,
  userId: string,
  vaultId: string,
  itemId: string,
  keyVersion: string,
  revision: number,
  vaultKey: Uint8Array,
) {
  if (!isPasswordRecord(record) || !/^v[1-9]\d*$/.test(keyVersion) || revision < 1) {
    throw new Error("The password record is invalid.");
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const nonce = randomBytes(12);
  try {
    const cryptoKey = await importAesKey(vaultKey, ["encrypt"]);
    const iv = copyBuffer(nonce);
    const additionalData = copyBuffer(itemAad(userId, vaultId, itemId, keyVersion, revision));
    const plaintextBuffer = copyBuffer(plaintext);
    let ciphertext: Uint8Array;
    try {
      ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData, tagLength: 128 },
        cryptoKey,
        plaintextBuffer,
      ));
    } finally {
      clearBuffer(iv);
      clearBuffer(additionalData);
      clearBuffer(plaintextBuffer);
    }
    try {
      return { nonce: encodeBase64(nonce), ciphertext: encodeBase64(ciphertext) };
    } finally {
      ciphertext.fill(0);
    }
  } finally {
    plaintext.fill(0);
    nonce.fill(0);
  }
}
