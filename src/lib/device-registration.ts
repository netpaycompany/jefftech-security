import { createClient } from "@/lib/supabase/client";

const DEVICE_ID_KEY = "jefftech.device-id";
const deviceRegistrationPromises = new Map<string, Promise<string>>();

export function getCurrentDeviceId(profileId: string) {
  const storageKey = `${DEVICE_ID_KEY}:${profileId}`;
  let id = localStorage.getItem(storageKey);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export function forgetCurrentDeviceId(profileId: string) {
  const storageKey = `${DEVICE_ID_KEY}:${profileId}`;
  const deviceId = localStorage.getItem(storageKey);
  localStorage.removeItem(storageKey);
  if (deviceId) deviceRegistrationPromises.delete(`${profileId}:${deviceId}`);
}

export function getCurrentDeviceName() {
  const userAgent = navigator.userAgent;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const platform = /Android|iPhone|iPad|Mobile/i.test(userAgent)
    ? "Mobile"
    : navigator.platform || "Computer";
  return `${platform} · ${browser}`.slice(0, 80);
}

export async function ensureCurrentBrowserRegistered(): Promise<string | null> {
  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw new Error(`Unable to verify your Jefftech account: ${authError.message}`);
  if (!user) return null;

  const deviceId = getCurrentDeviceId(user.id);
  const registrationKey = `${user.id}:${deviceId}`;
  const existing = deviceRegistrationPromises.get(registrationKey);
  if (existing) return existing;

  const registration = (async () => {
    const { data: previousDevice, error: lookupError } = await client
      .from("devices")
      .select("id")
      .eq("id", deviceId)
      .maybeSingle();
    if (lookupError) throw new Error(`Unable to check this browser's registration: ${lookupError.message}`);

    const { error: registrationError } = await client.rpc("register_vault_device", {
      p_device_id: deviceId,
      p_device_name: getCurrentDeviceName(),
      p_device_type: "web",
    });
    if (registrationError) throw new Error(`Unable to register this browser: ${registrationError.message}`);

    if (!previousDevice) {
      const { error: auditError } = await client.rpc("record_security_event", {
        p_event_type: "device_registered",
        p_severity: "info",
      });
      if (auditError) throw new Error(`This browser was registered, but its security notification could not be recorded: ${auditError.message}`);
    }

    return user.id;
  })();
  deviceRegistrationPromises.set(registrationKey, registration);
  void registration.then(
    () => {
      if (deviceRegistrationPromises.get(registrationKey) === registration) {
        deviceRegistrationPromises.delete(registrationKey);
      }
    },
    () => {
      if (deviceRegistrationPromises.get(registrationKey) === registration) {
        deviceRegistrationPromises.delete(registrationKey);
      }
    },
  );
  return registration;
}
