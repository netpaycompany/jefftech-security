"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Copy, KeyRound, ShieldCheck } from "lucide-react";

import { useVault } from "@/components/vault/vault-provider";
import {
  ARGON2ID_PARAMETERS,
  VAULT_ALGORITHM,
} from "@/lib/security";
import {
  createKeyEnvelope,
  encryptVaultItem,
  encodeRecoveryKey,
  generateRecoveryKey,
  generateVaultKey,
  legacyPasswordStorageKey,
  loadEncryptedVaultRecords,
  migrateLegacyPasswordRecords,
  nextKeyVersion,
  parseLegacyPasswordRecords,
  parseRecoveryKey,
  unwrapVaultKeyWithMasterPassword,
  unwrapVaultKeyWithRecoveryKey,
  type EncryptedKeyEnvelope,
  type VaultKeyRow,
} from "@/lib/vault";
import { commitPhotoKeyRotation, preparePhotoKeyRotation } from "@/lib/photo-library";
import { createClient } from "@/lib/supabase/client";

type VaultMetadata = {
  userId: string;
  vaultId: string;
  keyVersion: string;
  keyRow: VaultKeyRow;
};

type PendingSetup = {
  vaultId: string;
  userId: string;
  vaultKey: Uint8Array;
  recoveryKey: Uint8Array;
  envelope: EncryptedKeyEnvelope;
  initialized: boolean;
};

type PendingRotation = {
  userId: string;
  vaultId: string;
  oldVersion: string;
  key: Uint8Array;
  recoveryKey: Uint8Array;
  keyVersion: string;
  envelope: EncryptedKeyEnvelope;
  items: {
    id: string;
    item_type: string;
    expected_revision: number;
    nonce: string;
    ciphertext: string;
  }[];
};

type PageState = "loading" | "setup" | "unlock" | "recover" | "unlocked";
const RECOVERY_DISPLAY_MS = 5 * 60 * 1000;

function isVaultKeyRow(value: unknown): value is VaultKeyRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.encrypted_vault_key === "string"
    && typeof row.wrapped_key_nonce === "string"
    && typeof row.salt === "string"
    && typeof row.algorithm === "string"
    && typeof row.kdf_algorithm === "string"
    && typeof row.recovery_ciphertext === "string"
    && typeof row.recovery_nonce === "string";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getVaultDestination() {
  const nextPath = new URLSearchParams(window.location.search).get("next");
  if (!nextPath?.startsWith("/")) {
    return "/passwords";
  }
  const destination = new URL(nextPath, window.location.origin);
  return destination.origin === window.location.origin
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : "/passwords";
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function VaultAccess() {
  const router = useRouter();
  const { session, unlock, replaceSession } = useVault();
  const pendingRef = useRef<PendingSetup | null>(null);
  const pendingRotationRef = useRef<PendingRotation | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [metadata, setMetadata] = useState<VaultMetadata | null>(null);
  const [userId, setUserId] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [confirmNewMasterPassword, setConfirmNewMasterPassword] = useState("");
  const [setupRecoveryCode, setSetupRecoveryCode] = useState("");
  const [rotationRecoveryCode, setRotationRecoveryCode] = useState("");
  const [rotationRecoveryConfirmed, setRotationRecoveryConfirmed] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [legacyInvalid, setLegacyInvalid] = useState(false);
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMetadata = useCallback(async () => {
    const client = createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) {
      throw new Error(`Unable to verify your account: ${authError.message}`);
    }
    if (!user) {
      router.replace("/login?next=/master-password");
      return;
    }

    setUserId(user.id);
    const legacy = window.localStorage.getItem(legacyPasswordStorageKey());
    if (legacy) {
      try {
        setLegacyCount(parseLegacyPasswordRecords(legacy).length);
        setLegacyInvalid(false);
      } catch {
        setLegacyCount(0);
        setLegacyInvalid(true);
      }
      setLegacyConfirmed(false);
    } else {
      setLegacyCount(0);
      setLegacyInvalid(false);
      setLegacyConfirmed(false);
    }

    const { data: vault, error: vaultError } = await client
      .from("vaults")
      .select("id,key_version")
      .eq("profile_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    if (vaultError) {
      throw new Error(`Unable to load encrypted vault settings: ${vaultError.message}`);
    }
    if (!vault) {
      setMetadata(null);
      setPageState("setup");
      return;
    }

    const { data: keyRow, error: keyError } = await client
      .from("vault_keys")
      .select("encrypted_vault_key,wrapped_key_nonce,salt,algorithm,kdf_algorithm,kdf_parameters,recovery_ciphertext,recovery_nonce")
      .eq("vault_id", vault.id)
      .eq("key_version", vault.key_version)
      .single();
    if (keyError) {
      throw new Error(`Unable to load encrypted vault settings: ${keyError.message}`);
    }
    if (!isVaultKeyRow(keyRow)) {
      throw new Error("The vault encryption configuration is incomplete.");
    }

    setMetadata({ userId: user.id, vaultId: vault.id, keyVersion: vault.key_version, keyRow });
    setPageState(session?.vaultId === vault.id ? "unlocked" : "unlock");
  }, [router, session?.vaultId]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadMetadata().catch((caughtError: unknown) => {
        if (active) {
          setError(getErrorMessage(caughtError, "Unable to load vault settings."));
          setPageState("loading");
        }
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadMetadata]);

  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending) {
      pending.vaultKey.fill(0);
      pending.recoveryKey.fill(0);
      pendingRef.current = null;
    }
    const pendingRotation = pendingRotationRef.current;
    if (pendingRotation) {
      pendingRotation.key.fill(0);
      pendingRotation.recoveryKey.fill(0);
      pendingRotationRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!setupRecoveryCode) {
      return;
    }

    const timer = window.setTimeout(() => {
      const pending = pendingRef.current;
      pending?.vaultKey.fill(0);
      pending?.recoveryKey.fill(0);
      pendingRef.current = null;
      setSetupRecoveryCode("");
      setError("Vault setup expired. Start setup again to generate and save a new recovery key.");
      setNotice("");
      setPageState(pending?.initialized ? "unlock" : "setup");
    }, RECOVERY_DISPLAY_MS);

    return () => window.clearTimeout(timer);
  }, [setupRecoveryCode]);

  useEffect(() => {
    if (!rotationRecoveryCode) {
      return;
    }

    const timer = window.setTimeout(() => {
      const pending = pendingRotationRef.current;
      pending?.key.fill(0);
      pending?.recoveryKey.fill(0);
      pendingRotationRef.current = null;
      setRotationRecoveryCode("");
      setRotationRecoveryConfirmed(false);
      setError("Key rotation expired before confirmation. Start the rotation again.");
      setNotice("");
    }, RECOVERY_DISPLAY_MS);

    return () => window.clearTimeout(timer);
  }, [rotationRecoveryCode]);

  const migrateLegacyCopy = async (
    activeUserId: string,
    vaultId: string,
    keyVersion: string,
    vaultKey: Uint8Array,
  ) => {
    const storageKey = legacyPasswordStorageKey();
    const legacy = window.localStorage.getItem(storageKey);
    if (!legacy) {
      return;
    }
    const legacyRecords = parseLegacyPasswordRecords(legacy);
    await migrateLegacyPasswordRecords(legacyRecords, activeUserId, vaultId, keyVersion, vaultKey);
    window.localStorage.removeItem(storageKey);
    setLegacyCount(0);
    setLegacyInvalid(false);
  };

  const unlockWithKey = async (activeMetadata: VaultMetadata, key: Uint8Array) => {
    try {
      await migrateLegacyCopy(activeMetadata.userId, activeMetadata.vaultId, activeMetadata.keyVersion, key);
      const records = await loadEncryptedVaultRecords(
        activeMetadata.userId,
        activeMetadata.vaultId,
        activeMetadata.keyVersion,
        key,
      );
      unlock({
        userId: activeMetadata.userId,
        vaultId: activeMetadata.vaultId,
        keyVersion: activeMetadata.keyVersion,
        key,
        records,
      });
      setPageState("unlocked");
      setMasterPassword("");
      setRecoveryInput("");
      setNewMasterPassword("");
      setConfirmNewMasterPassword("");
      router.replace(getVaultDestination());
      router.refresh();
    } catch (caughtError) {
      key.fill(0);
      throw caughtError;
    }
  };

  const handleSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (masterPassword.length < 12) {
      setError("Use a vault master password with at least 12 characters.");
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError("The master passwords do not match.");
      return;
    }
    if (!userId) {
      setError("Sign in before setting up your vault.");
      return;
    }

    setIsSubmitting(true);
    let vaultKey: Uint8Array | null = null;
    let recoveryKey: Uint8Array | null = null;
    try {
      const vaultId = crypto.randomUUID();
      vaultKey = generateVaultKey();
      recoveryKey = generateRecoveryKey();
      const envelope = await createKeyEnvelope(userId, vaultId, "v1", vaultKey, masterPassword, recoveryKey);
      pendingRef.current = { vaultId, userId, vaultKey, recoveryKey, envelope, initialized: false };
      setSetupRecoveryCode(encodeRecoveryKey(recoveryKey));
      setMasterPassword("");
      setConfirmPassword("");
      setPageState("setup");
      setNotice("Save this recovery key somewhere private before continuing. It is shown only once.");
    } catch (caughtError) {
      vaultKey?.fill(0);
      recoveryKey?.fill(0);
      setError(getErrorMessage(caughtError, "Unable to prepare encrypted vault keys."));
    } finally {
      setMasterPassword("");
      setConfirmPassword("");
      setIsSubmitting(false);
    }
  };

  const confirmSetup = async () => {
    const pending = pendingRef.current;
    if (!pending) {
      setError("Vault setup expired. Start setup again.");
      setSetupRecoveryCode("");
      return;
    }
    if (legacyCount > 0 && !legacyConfirmed) {
      setError("Confirm that these browser-stored credentials belong to this account before importing them.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      if (!pending.initialized) {
        const { error: initializeError } = await createClient().rpc("initialize_encrypted_vault", {
          p_vault_id: pending.vaultId,
          p_envelope: pending.envelope,
        });
        if (initializeError) {
          throw new Error(`Unable to create the encrypted vault: ${initializeError.message}`);
        }
        pending.initialized = true;
        setMetadata({
          userId: pending.userId,
          vaultId: pending.vaultId,
          keyVersion: "v1",
          keyRow: {
            encrypted_vault_key: pending.envelope.ciphertext,
            wrapped_key_nonce: pending.envelope.nonce,
            salt: pending.envelope.salt,
            algorithm: VAULT_ALGORITHM,
            kdf_algorithm: "Argon2id",
            kdf_parameters: ARGON2ID_PARAMETERS,
            recovery_ciphertext: pending.envelope.recovery_ciphertext,
            recovery_nonce: pending.envelope.recovery_nonce,
          },
        });
      }

      await migrateLegacyCopy(pending.userId, pending.vaultId, "v1", pending.vaultKey);
      const records = await loadEncryptedVaultRecords(pending.userId, pending.vaultId, "v1", pending.vaultKey);
      const vaultKey = pending.vaultKey;
      pending.recoveryKey.fill(0);
      pendingRef.current = null;
      setSetupRecoveryCode("");
      setMetadata({
        userId: pending.userId,
        vaultId: pending.vaultId,
        keyVersion: "v1",
        keyRow: {
          encrypted_vault_key: pending.envelope.ciphertext,
          wrapped_key_nonce: pending.envelope.nonce,
          salt: pending.envelope.salt,
          algorithm: VAULT_ALGORITHM,
          kdf_algorithm: "Argon2id",
          kdf_parameters: ARGON2ID_PARAMETERS,
          recovery_ciphertext: pending.envelope.recovery_ciphertext,
          recovery_nonce: pending.envelope.recovery_nonce,
        },
      });
      unlock({
        userId: pending.userId,
        vaultId: pending.vaultId,
        keyVersion: "v1",
        key: vaultKey,
        records,
      });
      setPageState("unlocked");
      router.replace(getVaultDestination());
      router.refresh();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to finish vault setup."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelSetup = () => {
    const pending = pendingRef.current;
    pending?.vaultKey.fill(0);
    pending?.recoveryKey.fill(0);
    pendingRef.current = null;
    setSetupRecoveryCode("");
    setNotice("");
    setError("");
    setPageState(pending?.initialized ? "unlock" : "setup");
  };

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!metadata) {
      setError("Vault settings are not available.");
      return;
    }
    if (legacyCount > 0 && !legacyConfirmed) {
      setError("Confirm that these browser-stored credentials belong to this account before importing them.");
      return;
    }

    setIsSubmitting(true);
    try {
      const key = await unwrapVaultKeyWithMasterPassword(
        metadata.userId,
        metadata.vaultId,
        metadata.keyVersion,
        metadata.keyRow,
        masterPassword,
      );
      await unlockWithKey(metadata, key);
    } catch (caughtError) {
      const message = getErrorMessage(caughtError, "Unable to unlock the vault.");
      setError(message.startsWith("Unable to load encrypted") || message.startsWith("Unable to check previously")
        ? message
        : "Unable to unlock the vault. Check the master password and vault integrity.");
    } finally {
      setMasterPassword("");
      setIsSubmitting(false);
    }
  };

  const handleRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!metadata) {
      setError("Vault settings are not available.");
      return;
    }
    if (legacyCount > 0 && !legacyConfirmed) {
      setError("Confirm that these browser-stored credentials belong to this account before importing them.");
      return;
    }
    if (newMasterPassword.length < 12 || newMasterPassword !== confirmNewMasterPassword) {
      setError(newMasterPassword.length < 12
        ? "Use a new master password with at least 12 characters."
        : "The new master passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    let recoveryKey: Uint8Array | null = null;
    let vaultKey: Uint8Array | null = null;
    try {
      recoveryKey = parseRecoveryKey(recoveryInput);
      vaultKey = await unwrapVaultKeyWithRecoveryKey(
        metadata.userId,
        metadata.vaultId,
        metadata.keyVersion,
        metadata.keyRow,
        recoveryKey,
      );
      const envelope = await createKeyEnvelope(
        metadata.userId,
        metadata.vaultId,
        metadata.keyVersion,
        vaultKey,
        newMasterPassword,
        recoveryKey,
      );
      envelope.recovery_ciphertext = metadata.keyRow.recovery_ciphertext;
      envelope.recovery_nonce = metadata.keyRow.recovery_nonce;
      const { error: recoverError } = await createClient().rpc("recover_encrypted_vault", {
        p_vault_id: metadata.vaultId,
        p_key_version: metadata.keyVersion,
        p_master_envelope: envelope,
      });
      if (recoverError) {
        throw new Error(`Unable to update the vault master password: ${recoverError.message}`);
      }
      await unlockWithKey(metadata, vaultKey);
      vaultKey = null;
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to recover the vault."));
    } finally {
      recoveryKey?.fill(0);
      vaultKey?.fill(0);
      setRecoveryInput("");
      setNewMasterPassword("");
      setConfirmNewMasterPassword("");
      setIsSubmitting(false);
    }
  };

  const handleRotate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!session || !metadata || session.vaultId !== metadata.vaultId) {
      setError("Unlock the current vault before rotating its encryption key.");
      return;
    }

    setIsSubmitting(true);
    let recoveryKey: Uint8Array | null = null;
    let newVaultKey: Uint8Array | null = null;
    let newRecoveryKey: Uint8Array | null = null;
    let pendingKeysTransferred = false;
    try {
      recoveryKey = parseRecoveryKey(recoveryInput);
      const verifiedKey = await unwrapVaultKeyWithMasterPassword(
        session.userId,
        session.vaultId,
        session.keyVersion,
        metadata.keyRow,
        masterPassword,
      );
      const masterPasswordIsValid = secureEqual(verifiedKey, session.key);
      verifiedKey.fill(0);
      if (!masterPasswordIsValid) {
        throw new Error("The current master password is incorrect.");
      }

      const nextVersion = nextKeyVersion(session.keyVersion);
      newVaultKey = generateVaultKey();
      newRecoveryKey = generateRecoveryKey();
      const envelope = await createKeyEnvelope(
        session.userId,
        session.vaultId,
        nextVersion,
        newVaultKey,
        masterPassword,
        newRecoveryKey,
      );

      const encryptedItems = await Promise.all(session.records.map(async (record) => {
        const encrypted = await encryptVaultItem(
          record.content,
          record.itemType,
          session.userId,
          session.vaultId,
          record.id,
          nextVersion,
          record.revision + 1,
          newVaultKey!,
        );
        return {
          id: record.id,
          item_type: record.itemType,
          expected_revision: record.revision,
          nonce: encrypted.nonce,
          ciphertext: encrypted.ciphertext,
        };
      }));

      pendingRotationRef.current = {
        userId: session.userId,
        vaultId: session.vaultId,
        oldVersion: session.keyVersion,
        key: newVaultKey,
        recoveryKey: newRecoveryKey,
        keyVersion: nextVersion,
        envelope,
        items: encryptedItems,
      };
      pendingKeysTransferred = true;
      newVaultKey = null;
      newRecoveryKey = null;
      setRotationRecoveryCode(encodeRecoveryKey(pendingRotationRef.current.recoveryKey));
      setRotationRecoveryConfirmed(false);
      setMasterPassword("");
      setRecoveryInput("");
      setNotice("Save the new recovery key before confirming. The old recovery key will be revoked after rotation.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to rotate the vault key."));
    } finally {
      recoveryKey?.fill(0);
      if (!pendingKeysTransferred) {
        newVaultKey?.fill(0);
        newRecoveryKey?.fill(0);
      }
      setMasterPassword("");
      setRecoveryInput("");
      setIsSubmitting(false);
    }
  };

  const confirmRotation = async () => {
    const pending = pendingRotationRef.current;
    if (!pending || !session || !metadata || !rotationRecoveryConfirmed) {
      setError("Save the new recovery key and confirm before rotating the vault.");
      return;
    }
    if (
      pending.userId !== session.userId
      || pending.vaultId !== session.vaultId
      || pending.oldVersion !== session.keyVersion
      || metadata.vaultId !== session.vaultId
    ) {
      pending.key.fill(0);
      pending.recoveryKey.fill(0);
      pendingRotationRef.current = null;
      setRotationRecoveryCode("");
      setRotationRecoveryConfirmed(false);
      setError("The vault changed while rotation was pending. Start the rotation again.");
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      const photoRotation = await preparePhotoKeyRotation(
        session.key,
        session.keyVersion,
        pending.key,
        pending.keyVersion,
      );
      const { error: rotationError } = await createClient().rpc("rotate_encrypted_vault", {
        p_vault_id: pending.vaultId,
        p_old_version: pending.oldVersion,
        p_new_envelope: pending.envelope,
        p_items: pending.items,
      });
      if (rotationError) {
        throw new Error(`Unable to rotate the vault key: ${rotationError.message}`);
      }

      let photoRotationError = "";
      if (photoRotation) {
        try {
          await commitPhotoKeyRotation(photoRotation);
        } catch (caughtError) {
          photoRotationError = getErrorMessage(caughtError, "Local photos could not be re-encrypted.");
        }
      }

      const records = session.records.map((record) => ({ ...record, revision: record.revision + 1 }));
      pendingRotationRef.current = null;
      replaceSession({
        ...session,
        keyVersion: pending.keyVersion,
        key: pending.key,
        records,
      });
      pending.recoveryKey.fill(0);
      setMetadata({
        ...metadata,
        keyVersion: pending.keyVersion,
        keyRow: {
          encrypted_vault_key: pending.envelope.ciphertext,
          wrapped_key_nonce: pending.envelope.nonce,
          salt: pending.envelope.salt,
          algorithm: VAULT_ALGORITHM,
          kdf_algorithm: "Argon2id",
          kdf_parameters: ARGON2ID_PARAMETERS,
          recovery_ciphertext: pending.envelope.recovery_ciphertext,
          recovery_nonce: pending.envelope.recovery_nonce,
        },
      });
      setRotationRecoveryCode("");
      setRotationRecoveryConfirmed(false);
      if (photoRotationError) {
        setError(`The vault key was rotated, but local photos could not be re-encrypted: ${photoRotationError}`);
      } else {
        setNotice("The vault key was rotated and the previous recovery key was revoked.");
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Unable to rotate the vault key."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelRotation = () => {
    const pending = pendingRotationRef.current;
    pending?.key.fill(0);
    pending?.recoveryKey.fill(0);
    pendingRotationRef.current = null;
    setRotationRecoveryCode("");
    setRotationRecoveryConfirmed(false);
    setError("");
    setNotice("Key rotation cancelled. The existing vault and recovery key are unchanged.");
  };

  const deleteLegacyCopy = () => {
    if (!window.confirm("Permanently delete the old unencrypted browser-stored credentials?")) {
      return;
    }
    window.localStorage.removeItem(legacyPasswordStorageKey());
    setLegacyCount(0);
    setLegacyInvalid(false);
    setNotice("The unencrypted browser copy was deleted.");
  };

  const copyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(setupRecoveryCode);
      setNotice("Recovery key copied. Store it somewhere private before continuing.");
    } catch {
      setError("Clipboard access failed. Select and copy the recovery key manually.");
    }
  };

  const copyRotationRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(rotationRecoveryCode);
      setNotice("New recovery key copied. Store it privately before confirming rotation.");
    } catch {
      setError("Clipboard access failed. Select and copy the new recovery key manually.");
    }
  };

  const readLegacyCount = legacyCount > 0;
  const visiblePageState = pageState === "unlocked" && !session ? "unlock" : pageState;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-2xl rounded-[30px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-950/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
            <p className="text-lg font-semibold text-white">Encrypted vault</p>
          </div>
        </div>

        {visiblePageState === "loading" && (
          <p role="status" className="text-sm text-slate-400">Loading vault encryption settings...</p>
        )}

        {visiblePageState === "setup" && !setupRecoveryCode && (
          <>
            <h1 className="text-3xl font-semibold text-white">Set your vault master password</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              A random 256-bit vault key encrypts each record on this device. Your master password derives a wrapping key with Argon2id and is never sent to Supabase.
            </p>
            {readLegacyCount && (
              <p className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
                {legacyCount} old browser-stored {legacyCount === 1 ? "credential will" : "credentials will"} be encrypted and imported when setup completes. The plaintext browser copy is removed only after import succeeds.
              </p>
            )}
            {legacyInvalid && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-100">
                Old browser-stored credentials could not be imported safely. You can delete that unencrypted copy, or leave it and resolve the format before unlocking.
                <button type="button" onClick={deleteLegacyCopy} className="mt-3 block font-medium text-red-200 underline">
                  Delete old browser-stored credentials
                </button>
              </div>
            )}
            {readLegacyCount && (
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                <input type="checkbox" checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950" />
                I confirm these old browser-stored credentials belong to this account and should be encrypted into its vault.
              </label>
            )}
            <form onSubmit={handleSetup} className="mt-8 space-y-5">
              <label className="block text-sm text-slate-300">
                New master password
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(event) => setMasterPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Confirm master password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm leading-6 text-slate-300">
                If both your master password and recovery key are lost, the encrypted vault cannot be recovered. Administrators cannot decrypt it or reset the master password.
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !userId || legacyInvalid || (readLegacyCount && !legacyConfirmed)}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {isSubmitting ? "Preparing secure keys..." : "Create encrypted vault"}
                {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </button>
            </form>
          </>
        )}

        {visiblePageState === "setup" && setupRecoveryCode && (
          <section>
            <h1 className="text-3xl font-semibold text-white">Save your recovery key</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This user-held key can restore access if you forget the master password. It is not stored by the service and cannot be shown again.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-blue-200">{setupRecoveryCode}</code>
              <button
                type="button"
                onClick={copyRecoveryKey}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
              Keep it offline in a secure place. Anyone with this key can decrypt the vault key. If both this key and your master password are lost, no administrator can recover your data.
            </p>
            {legacyInvalid && (
              <p role="alert" className="mt-4 text-sm text-red-200">
                The old browser credentials could not be imported. Delete the unencrypted copy or cancel setup and resolve the data before continuing.
                <button type="button" onClick={deleteLegacyCopy} className="ml-2 underline">Delete it</button>
              </p>
            )}
            {readLegacyCount && (
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-300">
                <input type="checkbox" checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950" />
                I confirm these old browser-stored credentials belong to this account and should be encrypted into its vault.
              </label>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={cancelSetup} disabled={isSubmitting} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSetup}
                disabled={isSubmitting || legacyInvalid || (readLegacyCount && !legacyConfirmed)}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSubmitting ? "Securing vault..." : "I saved my recovery key"}
              </button>
            </div>
          </section>
        )}

        {visiblePageState === "unlock" && (
          <>
            <h1 className="text-3xl font-semibold text-white">Unlock your vault</h1>
            <p className="mt-2 text-sm text-slate-400">
              Your master password is used locally to derive the key that unwraps your vault key.
            </p>
            {readLegacyCount && (
              <p className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
                {legacyCount} old browser-stored {legacyCount === 1 ? "credential will" : "credentials will"} be encrypted and imported during unlock.
              </p>
            )}
            {legacyInvalid && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-100">
                Old browser-stored credentials cannot be imported safely. Delete the unencrypted copy to continue, or resolve its format first.
                <button type="button" onClick={deleteLegacyCopy} className="mt-3 block font-medium text-red-200 underline">
                  Delete old browser-stored credentials
                </button>
              </div>
            )}
            {readLegacyCount && (
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-300">
                <input type="checkbox" checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950" />
                I confirm these old browser-stored credentials belong to this account and should be encrypted into its vault.
              </label>
            )}
            <form onSubmit={handleUnlock} className="mt-8 space-y-5">
              <label className="block text-sm text-slate-300">
                Master password
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(event) => setMasterPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || legacyInvalid || (readLegacyCount && !legacyConfirmed)}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {isSubmitting ? "Unlocking..." : "Unlock vault"}
                {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </button>
            </form>
            <button type="button" onClick={() => { setError(""); setPageState("recover"); }} className="mt-5 text-sm font-medium text-blue-300 underline">
              Forgot master password? Recover with your key
            </button>
          </>
        )}

        {visiblePageState === "recover" && (
          <>
            <h1 className="text-3xl font-semibold text-white">Recover vault access</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use your user-held recovery key and set a new master password. This recovery key remains valid afterward.
            </p>
            {legacyInvalid && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-100">
                Old browser-stored credentials cannot be imported safely. Delete the unencrypted copy or resolve its format before continuing.
                <button type="button" onClick={deleteLegacyCopy} className="mt-3 block font-medium text-red-200 underline">
                  Delete old browser-stored credentials
                </button>
              </div>
            )}
            {readLegacyCount && (
              <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-300">
                <input type="checkbox" checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950" />
                I confirm these old browser-stored credentials belong to this account and should be encrypted into its vault.
              </label>
            )}
            <form onSubmit={handleRecovery} className="mt-8 space-y-5">
              <label className="block text-sm text-slate-300">
                Recovery key
                <input
                  type="password"
                  value={recoveryInput}
                  onChange={(event) => setRecoveryInput(event.target.value)}
                  autoComplete="off"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                New master password
                <input
                  type="password"
                  value={newMasterPassword}
                  onChange={(event) => setNewMasterPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Confirm new master password
                <input
                  type="password"
                  value={confirmNewMasterPassword}
                  onChange={(event) => setConfirmNewMasterPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <button type="submit" disabled={isSubmitting || legacyInvalid || (readLegacyCount && !legacyConfirmed)} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
                {isSubmitting ? "Recovering..." : "Set new master password"}
              </button>
            </form>
            <button type="button" onClick={() => { setError(""); setPageState("unlock"); }} className="mt-5 text-sm font-medium text-blue-300 underline">
              Back to unlock
            </button>
          </>
        )}

        {visiblePageState === "unlocked" && session && rotationRecoveryCode && (
          <section>
            <h1 className="text-3xl font-semibold text-white">Save your new recovery key</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Rotation will replace the old recovery key. Save this new key securely before committing; the old key will stop working afterward.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-blue-200">{rotationRecoveryCode}</code>
              <button
                type="button"
                onClick={copyRotationRecoveryKey}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
              Anyone holding this recovery key can decrypt the vault key. The service does not store it in plaintext.
            </p>
            <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-300">
              <input
                type="checkbox"
                checked={rotationRecoveryConfirmed}
                onChange={(event) => setRotationRecoveryConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950"
              />
              I saved the new recovery key and understand the previous recovery key will be revoked.
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={cancelRotation} disabled={isSubmitting} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
                Cancel rotation
              </button>
              <button
                type="button"
                onClick={() => void confirmRotation()}
                disabled={isSubmitting || !rotationRecoveryConfirmed}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSubmitting ? "Rotating keys..." : "Confirm key rotation"}
              </button>
            </div>
          </section>
        )}

        {visiblePageState === "unlocked" && session && !rotationRecoveryCode && (
          <>
            <div className="flex items-center gap-3">
              <KeyRound className="h-6 w-6 text-blue-300" />
              <h1 className="text-3xl font-semibold text-white">Rotate vault key</h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Rotation creates a fresh random vault key, re-encrypts every record, advances the key version, and atomically replaces the old key envelope. Your master password and recovery key remain unchanged.
            </p>
            <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">
              Current encryption: {VAULT_ALGORITHM}, key version {session.keyVersion}. Enter both credentials to authorize rotation.
            </p>
            <form onSubmit={handleRotate} className="mt-6 space-y-5">
              <label className="block text-sm text-slate-300">
                Master password
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(event) => setMasterPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Existing recovery key
                <input
                  type="password"
                  value={recoveryInput}
                  onChange={(event) => setRecoveryInput(event.target.value)}
                  autoComplete="off"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white"
                />
              </label>
              <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
                {isSubmitting ? "Re-encrypting vault..." : "Rotate encryption key"}
              </button>
            </form>
          </>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
        <p className="mt-6 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
          Locking clears key buffers and decrypted UI state, but JavaScript strings and browser-managed memory cannot be reliably overwritten. Keep your browser and device secure; extensions or injected scripts can access an unlocked page.
        </p>
        {visiblePageState === "unlocked" && (
          <button type="button" onClick={() => router.replace("/passwords")} className="mt-5 text-sm font-medium text-blue-300 underline">
            Return to encrypted passwords
          </button>
        )}
      </div>
    </main>
  );
}
