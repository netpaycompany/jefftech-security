import {
  base64ToBytes,
  bytesToBase64,
  decryptVaultRecord,
  deriveArgon2idKey,
  generateSecureRandomBytes,
} from "@/lib/security";

type PhotoLibraryConfig = {
  id: "library";
  salt: string;
  verifierCiphertext: string;
  verifierNonce: string;
};

type DeviceKeyConfig = {
  id: "device-key";
  key: CryptoKey;
};

type VaultKeyConfig = {
  id: "vault-key";
  version: string;
};

export type PhotoKey = Uint8Array;
type PhotoEncryptionKey = PhotoKey | CryptoKey;
export type PhotoLibraryStatus = "legacy" | "ready";
export type PendingPhotoKeyRotation = {
  oldVersion: string;
  newVersion: string;
  sourceRecords: EncryptedPhoto[];
  records: EncryptedPhoto[];
};

export type EncryptedPhoto = {
  id: string;
  photoCiphertext: string;
  photoNonce: string;
  metadataCiphertext: string;
  metadataNonce: string;
};

export type PhotoMetadata = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};

const DATABASE_NAME = "jefftech-private-photos";
const DATABASE_VERSION = 1;
const PHOTO_STORE = "photos";
const SETTINGS_STORE = "settings";
const VERIFIER_TEXT = "jefftech-private-photo-library";
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open private photo storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Private photo storage request failed."));
  });
}

function transactionResult(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Private photo storage transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Private photo storage transaction failed."));
  });
}

async function getStoredPhotoSettings() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const completed = transactionResult(transaction);
    const store = transaction.objectStore(SETTINGS_STORE);
    const [library, deviceKey, vaultKey] = await Promise.all([
      requestResult<PhotoLibraryConfig | undefined>(store.get("library")),
      requestResult<DeviceKeyConfig | undefined>(store.get("device-key")),
      requestResult<VaultKeyConfig | undefined>(store.get("vault-key")),
    ]);
    await completed;
    return { library, deviceKey, vaultKey };
  } finally {
    database.close();
  }
}

export async function getPhotoLibraryStatus(): Promise<PhotoLibraryStatus> {
  const { library } = await getStoredPhotoSettings();
  return library ? "legacy" : "ready";
}

async function encryptPhotoRecord(metadata: PhotoMetadata, plaintext: Uint8Array, key: PhotoKey) {
  const encryptedMetadata = await encryptText(JSON.stringify(metadata), key);
  const nonce = generateSecureRandomBytes(12);
  const cryptoKey = await resolvePhotoKey(key);
  const plaintextCopy = new Uint8Array(plaintext.length);
  plaintextCopy.set(plaintext);
  try {
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      plaintextCopy,
    );
    return {
      id: metadata.id,
      photoCiphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
      photoNonce: bytesToBase64(nonce),
      metadataCiphertext: encryptedMetadata.ciphertext,
      metadataNonce: encryptedMetadata.nonce,
    };
  } finally {
    plaintextCopy.fill(0);
  }
}

async function reencryptPhotoRecords(records: EncryptedPhoto[], sourceKey: PhotoEncryptionKey, targetKey: PhotoKey) {
  return Promise.all(records.map(async (record) => {
    const metadataText = await decryptText(record.metadataCiphertext, record.metadataNonce, sourceKey);
    const metadata = JSON.parse(metadataText) as PhotoMetadata;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.photoNonce) },
      await resolvePhotoKey(sourceKey),
      base64ToBytes(record.photoCiphertext),
    );
    const plaintextBytes = new Uint8Array(plaintext);
    try {
      return await encryptPhotoRecord(metadata, plaintextBytes, targetKey);
    } finally {
      plaintextBytes.fill(0);
    }
  }));
}

async function savePhotoKeyMigration(
  records: EncryptedPhoto[],
  vaultKeyVersion: string,
  removeLegacySettings: boolean,
) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PHOTO_STORE, SETTINGS_STORE], "readwrite");
    const completed = transactionResult(transaction);
    const photoStore = transaction.objectStore(PHOTO_STORE);
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    records.forEach((record) => photoStore.put(record));
    if (removeLegacySettings) {
      settingsStore.delete("library");
      settingsStore.delete("device-key");
    }
    settingsStore.put({ id: "vault-key", version: vaultKeyVersion } satisfies VaultKeyConfig);
    await completed;
  } finally {
    database.close();
  }
}

export async function preparePhotoLibrary(
  vaultKey: PhotoKey,
  vaultKeyVersion: string,
  legacyPassphrase?: string,
) {
  const { library, deviceKey, vaultKey: storedVaultKey } = await getStoredPhotoSettings();
  if (library) {
    if (!legacyPassphrase) {
      throw new Error("Enter the previous photo passphrase once to migrate this library to your vault password.");
    }
    const { key } = await deriveArgon2idKey(legacyPassphrase, base64ToBytes(library.salt));
    try {
      const verifier = await decryptVaultRecord(library.verifierCiphertext, library.verifierNonce, key);
      if (verifier !== VERIFIER_TEXT) {
        throw new Error("The previous photo passphrase is incorrect.");
      }
      const records = await listEncryptedPhotos();
      const encryptedRecords = await reencryptPhotoRecords(records, key, vaultKey);
      await savePhotoKeyMigration(encryptedRecords, vaultKeyVersion, true);
    } catch (error) {
      if (error instanceof Error && error.message === "The previous photo passphrase is incorrect.") {
        throw error;
      }
      throw new Error("Could not migrate the old photo library. Check the previous passphrase and photo data.");
    } finally {
      key.fill(0);
    }
    return;
  }

  if (deviceKey) {
    const records = await listEncryptedPhotos();
    const encryptedRecords = await reencryptPhotoRecords(records, deviceKey.key, vaultKey);
    await savePhotoKeyMigration(encryptedRecords, vaultKeyVersion, true);
    return;
  }

  if (storedVaultKey && storedVaultKey.version !== vaultKeyVersion) {
    throw new Error("The local photos use a different vault key version. Reopen this browser after unlocking the current vault.");
  }
  if (!storedVaultKey) {
    await savePhotoKeyMigration([], vaultKeyVersion, false);
  }
}

export async function preparePhotoKeyRotation(
  oldKey: PhotoKey,
  oldVersion: string,
  newKey: PhotoKey,
  newVersion: string,
): Promise<PendingPhotoKeyRotation | null> {
  const { vaultKey } = await getStoredPhotoSettings();
  if (!vaultKey || vaultKey.version !== oldVersion) {
    return null;
  }
  const sourceRecords = await listEncryptedPhotos();
  return {
    oldVersion,
    newVersion,
    sourceRecords,
    records: await reencryptPhotoRecords(sourceRecords, oldKey, newKey),
  };
}

export async function commitPhotoKeyRotation(rotation: PendingPhotoKeyRotation) {
  const currentRecords = await listEncryptedPhotos();
  if (JSON.stringify(currentRecords) !== JSON.stringify(rotation.sourceRecords)) {
    throw new Error("Photos changed during vault key rotation. Reopen Photos to synchronize its encryption.");
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction([PHOTO_STORE, SETTINGS_STORE], "readwrite");
    const completed = transactionResult(transaction);
    const photoStore = transaction.objectStore(PHOTO_STORE);
    rotation.records.forEach((record) => photoStore.put(record));
    transaction.objectStore(SETTINGS_STORE).put({
      id: "vault-key",
      version: rotation.newVersion,
    } satisfies VaultKeyConfig);
    await completed;
  } finally {
    database.close();
  }
}

export async function listEncryptedPhotos() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PHOTO_STORE, "readonly");
    const completed = transactionResult(transaction);
    const photos = await requestResult<EncryptedPhoto[]>(transaction.objectStore(PHOTO_STORE).getAll());
    await completed;
    return photos;
  } finally {
    database.close();
  }
}

export async function saveEncryptedPhoto(file: File, key: PhotoKey) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image file.`);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(`${file.name} is larger than the 20 MB per-photo limit.`);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const metadata: PhotoMetadata = { id, name: file.name, type: file.type, size: file.size, createdAt };
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  let record: EncryptedPhoto;
  try {
    record = await encryptPhotoRecord(metadata, sourceBytes, key);
  } finally {
    sourceBytes.fill(0);
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    const completed = transactionResult(transaction);
    transaction.objectStore(PHOTO_STORE).put(record);
    await completed;
  } finally {
    database.close();
  }
}

export async function decryptPhoto(record: EncryptedPhoto, key: PhotoKey) {
  const metadataText = await decryptText(record.metadataCiphertext, record.metadataNonce, key);
  const metadata = JSON.parse(metadataText) as PhotoMetadata;
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.photoNonce) },
    await resolvePhotoKey(key),
    base64ToBytes(record.photoCiphertext),
  ));
  try {
    return { metadata, blob: new Blob([plaintext], { type: metadata.type }) };
  } finally {
    plaintext.fill(0);
  }
}

export async function deleteEncryptedPhoto(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    const completed = transactionResult(transaction);
    transaction.objectStore(PHOTO_STORE).delete(id);
    await completed;
  } finally {
    database.close();
  }
}

async function importPhotoKey(key: Uint8Array) {
  const stableKey = new Uint8Array(key.length);
  stableKey.set(key);
  try {
    return await crypto.subtle.importKey("raw", stableKey, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    stableKey.fill(0);
  }
}

async function resolvePhotoKey(key: PhotoEncryptionKey) {
  if (key instanceof Uint8Array) {
    return importPhotoKey(key);
  }
  return key;
}

async function encryptText(plaintext: string, key: PhotoEncryptionKey) {
  const nonce = generateSecureRandomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await resolvePhotoKey(key),
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), nonce: bytesToBase64(nonce) };
}

async function decryptText(ciphertext: string, nonce: string, key: PhotoEncryptionKey) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    await resolvePhotoKey(key),
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
