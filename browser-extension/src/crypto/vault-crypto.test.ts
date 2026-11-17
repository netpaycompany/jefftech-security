import { describe, expect, it } from "vitest";
import { argon2id } from "hash-wasm";

import { decryptPassword, encodeBase64, encryptPassword, randomBytes, unwrapVaultKey } from "./vault-crypto";
import type { PasswordRecord, VaultKeyEnvelope } from "../types";

const userId = "9fc2b4a0-81d0-41fb-8e0d-143427d14f62";
const vaultId = "6731673c-3bf3-4f4e-9ed8-fb4eb6232278";
const itemId = "095ab5f4-6152-4ac9-a153-c0f8b25eb12f";
const keyVersion = "v1";
const record: PasswordRecord = {
  site: "Example",
  url: "https://example.com",
  username: "person@example.com",
  password: "A private value 47!",
  email: "",
  folder: "Personal",
  note: "test note",
  tags: ["test"],
  strength: "Strong",
  created: "2026-01-01",
  updated: "2026-01-01",
  favorite: false,
  passwordHistory: [],
};

function bytesToBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

describe("vault encryption compatibility", () => {
  it("unwraps the website's Argon2id/AES-GCM master-password key envelope", async () => {
    const masterPassword = "correct horse battery staple";
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const vaultKey = randomBytes(32);
    let derivedKey: Uint8Array | undefined;
    let ciphertext: Uint8Array | undefined;
    let aad: Uint8Array | undefined;
    try {
      const derivedHex = await argon2id({
        password: masterPassword,
        salt,
        iterations: 3,
        memorySize: 65_536,
        parallelism: 1,
        hashLength: 32,
        outputType: "hex",
        type: "argon2id",
      });
      derivedKey = Uint8Array.from(derivedHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
      const derivedKeyBuffer = new Uint8Array(derivedKey.length);
      derivedKeyBuffer.set(derivedKey);
      let cryptoKey: CryptoKey;
      try {
        cryptoKey = await crypto.subtle.importKey("raw", derivedKeyBuffer.buffer, "AES-GCM", false, ["encrypt"]);
      } finally {
        derivedKeyBuffer.fill(0);
      }
      const aadBytes = new TextEncoder().encode(JSON.stringify([
        "jefftech-vault", 1, "vault-key", userId, vaultId, keyVersion, "master",
      ]));
      aad = aadBytes;
      const ciphertextBytes = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aadBytes, tagLength: 128 },
        cryptoKey,
        vaultKey,
      ));
      ciphertext = ciphertextBytes;
      const envelope: VaultKeyEnvelope = {
        vault_id: vaultId,
        key_version: keyVersion,
        encrypted_vault_key: encodeBase64(ciphertextBytes),
        wrapped_key_nonce: encodeBase64(nonce),
        salt: encodeBase64(salt),
        algorithm: "AES-256-GCM",
        kdf_algorithm: "Argon2id",
        kdf_parameters: { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 },
      };

      const unwrapped = await unwrapVaultKey(envelope, userId, masterPassword);
      expect(unwrapped).toEqual(vaultKey);
      unwrapped.fill(0);
    } finally {
      salt.fill(0);
      nonce.fill(0);
      vaultKey.fill(0);
      derivedKey?.fill(0);
      ciphertext?.fill(0);
      aad?.fill(0);
    }
  });

  it("uses the website AAD format to encrypt and decrypt password records", async () => {
    const key = randomBytes(32);
    try {
      const encrypted = await encryptPassword(record, userId, vaultId, itemId, keyVersion, 1, key);
      expect(encrypted.ciphertext).not.toContain(record.password);
      const result = await decryptPassword({
        id: itemId,
        revision: 1,
        encrypted_payload: {
          algorithm: "AES-256-GCM",
          key_version: keyVersion,
          nonce: encrypted.nonce,
          ciphertext: encrypted.ciphertext,
        },
      }, userId, vaultId, keyVersion, key);
      expect(result).toEqual({ ...record, id: itemId, revision: 1 });
    } finally {
      key.fill(0);
    }
  });

  it("decrypts an item encrypted with the website's AAD serialization", async () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const plaintext = new TextEncoder().encode(JSON.stringify(record));
    try {
      const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
      const aad = new TextEncoder().encode(JSON.stringify([
        "jefftech-vault", 1, "vault-item", userId, vaultId, itemId, "password", keyVersion, 1,
      ]));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
        cryptoKey,
        plaintext,
      ));
      const result = await decryptPassword({
        id: itemId,
        revision: 1,
        encrypted_payload: {
          algorithm: "AES-256-GCM",
          key_version: keyVersion,
          nonce: bytesToBase64(nonce),
          ciphertext: bytesToBase64(ciphertext),
        },
      }, userId, vaultId, keyVersion, key);
      expect(result.password).toBe(record.password);
      ciphertext.fill(0);
    } finally {
      key.fill(0);
      nonce.fill(0);
      plaintext.fill(0);
    }
  });

  it("rejects authentication-data substitution and tampered ciphertext", async () => {
    const key = randomBytes(32);
    const encrypted = await encryptPassword(record, userId, vaultId, itemId, keyVersion, 1, key);
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (char) => char.charCodeAt(0));
    ciphertext[0] ^= 0x80;
    const tampered = bytesToBase64(ciphertext);
    await expect(decryptPassword({
      id: itemId,
      revision: 1,
      encrypted_payload: { algorithm: "AES-256-GCM", key_version: keyVersion, nonce: encrypted.nonce, ciphertext: encrypted.ciphertext },
    }, "c314b8d5-337a-4a56-83e4-d0c4247bb52d", vaultId, keyVersion, key)).rejects.toThrow();
    await expect(decryptPassword({
      id: itemId,
      revision: 1,
      encrypted_payload: { algorithm: "AES-256-GCM", key_version: keyVersion, nonce: encrypted.nonce, ciphertext: tampered },
    }, userId, vaultId, keyVersion, key)).rejects.toThrow();
    key.fill(0);
    ciphertext.fill(0);
  });
});
