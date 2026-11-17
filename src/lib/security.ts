export const VAULT_ALGORITHM = "AES-256-GCM" as const;
export const VAULT_KEY_VERSION = "v1";
export const ARGON2ID_PARAMETERS = {
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export function generateSecureRandomBytes(length: number) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 65_536) {
    throw new RangeError("The random byte length must be between 1 and 65536.");
  }

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toCryptoBytes(bytes: Uint8Array) {
  const result = new Uint8Array(bytes.length);
  result.set(bytes);
  return result;
}

export function bytesToBase64(bytes: Uint8Array) {
  const stable = toCryptoBytes(bytes);
  let binary = "";
  try {
    for (let i = 0; i < stable.length; i += 1) {
      binary += String.fromCharCode(stable[i]);
    }
    return btoa(binary);
  } finally {
    stable.fill(0);
  }
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function decodeCanonicalBase64(value: string, expectedLength?: number) {
  if (
    value.length > 5_592_408
    || (expectedLength !== undefined && value.length !== Math.ceil(expectedLength / 3) * 4)
  ) {
    throw new Error("Encrypted data has an invalid length.");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid encrypted data encoding.");
  }

  const bytes = base64ToBytes(value);
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error("Encrypted data has an invalid length.");
  }
  if (bytesToBase64(bytes) !== value) {
    throw new Error("Encrypted data has a non-canonical encoding.");
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string) {
  const cleaned = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = Number.parseInt(`${cleaned[i]}${cleaned[i + 1]}`, 16);
  }
  return bytes;
}

export async function deriveArgon2idKey(password: string, salt?: Uint8Array) {
  if (!password) {
    throw new Error("Enter your master password.");
  }

  const { argon2id } = await import("hash-wasm");
  const generatedSalt = salt === undefined;
  const normalizedSalt = salt ?? generateSecureRandomBytes(16);
  if (normalizedSalt.length !== 16) {
    if (generatedSalt) {
      normalizedSalt.fill(0);
    }
    throw new Error("The Argon2id salt must be 16 bytes.");
  }

  try {
    const derivedHex = await argon2id({
      password,
      salt: normalizedSalt,
      iterations: ARGON2ID_PARAMETERS.iterations,
      memorySize: ARGON2ID_PARAMETERS.memoryKiB,
      parallelism: ARGON2ID_PARAMETERS.parallelism,
      hashLength: ARGON2ID_PARAMETERS.hashLength,
      outputType: "hex",
      type: "argon2id",
    });

    return {
      key: hexToBytes(derivedHex),
      salt: toCryptoBytes(normalizedSalt),
    };
  } finally {
    if (generatedSalt) {
      normalizedSalt.fill(0);
    }
  }
}

function validateVaultKey(key: Uint8Array) {
  if (key.length !== 32) {
    throw new Error("Vault encryption keys must be 256 bits.");
  }
}

export async function encryptVaultBytes(
  plaintext: Uint8Array,
  key: Uint8Array,
  additionalData = new Uint8Array(),
  keyVersion = VAULT_KEY_VERSION,
) {
  if (!/^v[1-9]\d*$/.test(keyVersion)) {
    throw new Error("Unsupported vault key version.");
  }
  validateVaultKey(key);
  const nonce = generateSecureRandomBytes(12);
  const rawKey = toCryptoBytes(key);
  const plaintextCopy = toCryptoBytes(plaintext);
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
    const aadCopy = toCryptoBytes(additionalData);
    try {
      const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aadCopy, tagLength: 128 },
        cryptoKey,
        plaintextCopy,
      );
      return {
        ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
        nonce: bytesToBase64(nonce),
        algorithm: VAULT_ALGORITHM,
        keyVersion,
      };
    } finally {
      aadCopy.fill(0);
    }
  } finally {
    rawKey.fill(0);
    plaintextCopy.fill(0);
  }
}

export async function decryptVaultBytes(
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
  additionalData = new Uint8Array(),
) {
  validateVaultKey(key);
  const nonceBytes = decodeCanonicalBase64(nonce, 12);
  const ciphertextBytes = decodeCanonicalBase64(ciphertext);
  if (ciphertextBytes.length < 16) {
    throw new Error("Encrypted data is truncated.");
  }

  const rawKey = toCryptoBytes(key);
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const aadCopy = toCryptoBytes(additionalData);
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonceBytes, additionalData: aadCopy, tagLength: 128 },
        cryptoKey,
        ciphertextBytes,
      );
      return new Uint8Array(decrypted);
    } finally {
      aadCopy.fill(0);
    }
  } finally {
    rawKey.fill(0);
  }
}

export async function encryptVaultRecord(
  plaintext: string,
  key: Uint8Array,
  additionalData = new Uint8Array(),
  keyVersion = VAULT_KEY_VERSION,
) {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  try {
    return await encryptVaultBytes(plaintextBytes, key, additionalData, keyVersion);
  } finally {
    plaintextBytes.fill(0);
  }
}

export async function decryptVaultRecord(
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
  additionalData = new Uint8Array(),
) {
  const plaintextBytes = await decryptVaultBytes(ciphertext, nonce, key, additionalData);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintextBytes);
  } finally {
    plaintextBytes.fill(0);
  }
}
