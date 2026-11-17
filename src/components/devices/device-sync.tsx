"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";
import { createClient } from "@/lib/supabase/client";
import { VAULT_ALGORITHM, encryptVaultBytes } from "@/lib/security";
import { loadEncryptedVaultRecords, type VaultItem } from "@/lib/vault";

type Device = {
  id: string;
  device_name: string;
  device_type: string;
  trust_level: string;
  verified_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
};

const DEVICE_ID_KEY = "jefftech.device-id";
const BACKUP_AAD = new TextEncoder().encode(JSON.stringify(["jefftech-encrypted-backup", 2]));

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceName() {
  const platform = navigator.platform || "Browser";
  return `${platform} browser`.slice(0, 80);
}

export function DeviceSync() {
  const { session, setRecords, lock } = useVault();
  const [userId, setUserId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadDevices = async () => {
    const client = createClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw new Error(userError.message);
    if (!user) {
      return { devices: [], userId: "" };
    }
    const { data, error: deviceError } = await client
      .from("devices")
      .select("id,device_name,device_type,trust_level,verified_at,revoked_at,last_seen_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false });
    if (deviceError) throw new Error(`Could not load device registrations: ${deviceError.message}`);
    return { devices: data ?? [], userId: user.id };
  };

  const reloadDevices = async () => {
    const result = await loadDevices();
    setDevices(result.devices);
    setUserId(result.userId);
  };

  useEffect(() => {
    void Promise.resolve()
      .then(() => setDeviceId(getDeviceId()))
      .catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Could not identify this browser."));
    void loadDevices()
      .then(({ devices: loadedDevices, userId: loadedUserId }) => {
        setDevices(loadedDevices);
        setUserId(loadedUserId);
      })
      .catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : "Could not load registered devices.");
      });
  }, []);

  const callDeviceRpc = async (name: "register_vault_device" | "verify_vault_device" | "revoke_vault_device", args: Record<string, unknown>) => {
    const { error: rpcError } = await createClient().rpc(name, args);
    if (rpcError) throw new Error(rpcError.message);
  };

  const register = async () => {
    if (!userId || !deviceId) {
      setError("Sign in to register this browser.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await createClient().rpc("register_vault_device", {
        p_device_id: deviceId,
        p_device_name: getDeviceName(),
        p_device_type: "web",
      });
      if (rpcError) throw new Error(rpcError.message);
      await reloadDevices();
      const { error: auditError } = await createClient().rpc("record_security_event", { p_event_type: "device_registered", p_severity: "info" });
      setNotice(auditError
        ? `This browser is registered, but the security event could not be recorded: ${auditError.message}`
        : "This browser is registered. Unlock the vault here before verifying it.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not register this browser.");
    } finally {
      setIsBusy(false);
    }
  };

  const verify = async () => {
    if (!session) {
      setError("Unlock the vault on this browser before verifying it.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      await callDeviceRpc("verify_vault_device", { p_device_id: deviceId });
      const { error: auditError } = await createClient().rpc("record_security_event", { p_event_type: "device_verified", p_severity: "info" });
      await reloadDevices();
      setNotice(auditError
        ? `This browser is verified, but the security event could not be recorded: ${auditError.message}`
        : "This browser is marked verified.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not verify this browser.");
    } finally {
      setIsBusy(false);
    }
  };

  const revoke = async (device: Device) => {
    if (!window.confirm(`Revoke registration for ${device.device_name}? This does not revoke the underlying Supabase sign-in token on that device.`)) {
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devices/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const result = await response.json() as { revoked?: boolean; signedOutAllDevices?: boolean; auditLogged?: boolean; error?: string };
      if (!response.ok && !result.revoked) throw new Error(result.error ?? "Could not revoke the device.");
      if (device.id === deviceId) lock();
      await createClient().auth.signOut();
      await reloadDevices();
      setNotice(!result.signedOutAllDevices
        ? result.error ?? "Device registration revoked, but active account sessions were not all invalidated."
        : !result.auditLogged
          ? "Device registration revoked and all sessions invalidated, but the security event could not be recorded."
          : "Device registration revoked and all account sessions invalidated. Re-authenticate to continue.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not revoke the device.");
    } finally {
      setIsBusy(false);
    }
  };

  const synchronize = async () => {
    if (!session) {
      setError("Unlock the vault before synchronizing.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const records = await loadEncryptedVaultRecords(
        session.userId,
        session.vaultId,
        session.keyVersion,
        session.key,
      );
      setRecords(records);
      await reloadDevices();
      setNotice(`Loaded ${records.length} latest encrypted records from the server.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Synchronization failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const downloadEncryptedBackup = async () => {
    if (!session) {
      setError("Unlock the vault before creating a backup.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    let plaintext: Uint8Array | undefined;
    try {
      const client = createClient();
      const [keyResult, items] = await Promise.all([
        client.from("vault_keys")
          .select("key_version,encrypted_vault_key,wrapped_key_nonce,salt,algorithm,kdf_algorithm,kdf_parameters,recovery_ciphertext,recovery_nonce")
          .eq("vault_id", session.vaultId)
          .eq("key_version", session.keyVersion)
          .single(),
        loadAllCiphertextItems(client, session.vaultId),
      ]);
      if (keyResult.error) throw new Error(`Could not read the encrypted key envelope: ${keyResult.error.message}`);

      const backupPayload = {
        format: "jefftech-encrypted-vault-backup",
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        vaultId: session.vaultId,
        keyVersion: session.keyVersion,
        keyEnvelope: keyResult.data,
        items,
      };
      plaintext = new TextEncoder().encode(JSON.stringify(backupPayload));
      const encrypted = await encryptVaultBytes(plaintext, session.key, BACKUP_AAD, session.keyVersion);
      const backup = {
        format: "jefftech-encrypted-backup",
        formatVersion: 2,
        algorithm: VAULT_ALGORITHM,
        keyVersion: session.keyVersion,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      };
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `jefftech-vault-${new Date().toISOString().slice(0, 10)}.jtb`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      const { error: auditError } = await client.rpc("record_security_event", { p_event_type: "encrypted_backup_created", p_severity: "info" });
      setNotice(auditError
        ? `Encrypted backup downloaded, but the security event could not be recorded: ${auditError.message}`
        : "Encrypted backup downloaded. Protect the file with the same vault password you use to unlock your data.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create an encrypted backup.");
    } finally {
      plaintext?.fill(0);
      setIsBusy(false);
    }
  };

  return (
    <AppShell title="Device Synchronization" activePath="/devices">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ciphertext synchronization</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Sync across devices</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Each device downloads the same ciphertext and unwraps the vault key locally with your master password. The master password, vault key, and decrypted records are not sent to Supabase.
              </p>
            </div>
            <button type="button" disabled={isBusy || !session} onClick={() => void synchronize()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              Sync now
            </button>
          </div>
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">
            Concurrent edits use database revision compare-and-swap. A stale write fails instead of silently overwriting newer ciphertext; reload the vault and resolve the edit manually. This page does not merge conflicting records automatically.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Device registrations</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Known devices</h2>
            </div>
            <button type="button" disabled={isBusy || !userId} onClick={() => void register()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">
              Register this browser
            </button>
          </div>
          <ul className="mt-5 space-y-3">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div>
                  <p className="font-medium text-white">{device.device_name}{device.id === deviceId ? " · This device" : ""}</p>
                  <p className="mt-1 text-xs text-slate-400">{device.device_type} · {device.trust_level} · Last seen {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "unknown"}</p>
                </div>
                <div className="flex gap-2">
                  {device.id === deviceId && device.trust_level !== "verified" && !device.revoked_at && (
                    <button type="button" disabled={isBusy || !session} onClick={() => void verify()} className="rounded-lg border border-blue-500/40 px-3 py-2 text-xs text-blue-200 disabled:opacity-50">Verify after unlock</button>
                  )}
                  {!device.revoked_at && (
                    <button type="button" disabled={isBusy} onClick={() => void revoke(device)} className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-200 disabled:opacity-50">Revoke</button>
                  )}
                </div>
              </li>
            ))}
            {devices.length === 0 && <li className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No device registrations loaded.</li>}
          </ul>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Device registration is currently an account-owned trust label, not a cryptographic server-side session binding. Revoking removes trust in this app and locks this browser if selected; it cannot invalidate a stolen Supabase token on another device. Sign out there and rotate the vault key if compromised.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-white">Encrypted backup download</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">The backup contains encrypted vault envelopes and opaque record metadata. The archive is encrypted with your unlocked vault key, so your vault password is the only password needed. It does not contain decrypted records or a plaintext vault key.</p>
          <button type="button" disabled={isBusy || !session} onClick={() => void downloadEncryptedBackup()} className="mt-4 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50">Create encrypted backup</button>
          <p className="mt-3 text-xs text-slate-500">Restore/import is not available yet. Keep the backup file private and retain access to your vault password or recovery key.</p>
        </section>

        {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${error ? "border-red-500/25 bg-red-500/5 text-red-200" : "border-emerald-500/25 bg-emerald-500/5 text-emerald-200"}`}>{error || notice}</p>}
      </div>
    </AppShell>
  );
}

async function loadAllCiphertextItems(client: ReturnType<typeof createClient>, vaultId: string): Promise<VaultItem[]> {
  const items: VaultItem[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("vault_items")
      .select("id,item_type,revision,encrypted_payload")
      .eq("vault_id", vaultId)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not read encrypted records: ${error.message}`);
    items.push(...(data as VaultItem[]));
    if (data.length < pageSize) return items;
  }
}
