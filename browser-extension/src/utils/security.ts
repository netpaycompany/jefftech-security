import type { PasswordRecord } from "../types";
import { randomBytes } from "../crypto/vault-crypto";

export function createPkcePair() {
  const verifier = toBase64Url(randomBytes(32));
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    .then((digest) => ({ verifier, challenge: toBase64Url(new Uint8Array(digest)) }));
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function isAllowedOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}

export function originMatches(recordUrl: string, pageUrl: string) {
  try {
    const saved = new URL(recordUrl);
    const active = new URL(pageUrl);
    return saved.protocol === "https:" && active.protocol === "https:" && saved.origin === active.origin;
  } catch {
    return false;
  }
}

export function passwordStrength(password: string) {
  const classes = Number(/[a-z]/.test(password))
    + Number(/[A-Z]/.test(password))
    + Number(/[0-9]/.test(password))
    + Number(/[^A-Za-z0-9]/.test(password));
  if (password.length >= 16 && classes >= 3) return "Strong" as const;
  if (password.length >= 12 && classes >= 2) return "Medium" as const;
  return "Weak" as const;
}

export function analyzePasswords(records: PasswordRecord[], now = Date.now()) {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.password, (counts.get(record.password) ?? 0) + 1);
  const oldThreshold = now - 365 * 24 * 60 * 60 * 1000;
  return {
    total: records.length,
    weak: records.filter((record) => passwordStrength(record.password) === "Weak").length,
    reused: records.filter((record) => (counts.get(record.password) ?? 0) > 1).length,
    old: records.filter((record) => {
      const updated = Date.parse(record.updated);
      return Number.isFinite(updated) && updated < oldThreshold;
    }).length,
  };
}

function randomIndex(max: number) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 256) throw new RangeError("Invalid character set size.");
  const limit = Math.floor(256 / max) * max;
  const sample = new Uint8Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % max;
}

export function generatePassword(
  length: number,
  options: { uppercase: boolean; lowercase: boolean; numbers: boolean; symbols: boolean },
) {
  if (!Number.isSafeInteger(length) || length < 8 || length > 128) {
    throw new RangeError("Password length must be between 8 and 128 characters.");
  }
  const groups = [
    options.uppercase ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "",
    options.lowercase ? "abcdefghijkmnopqrstuvwxyz" : "",
    options.numbers ? "23456789" : "",
    options.symbols ? "!@#$%^&*()-_=+[]{};:,.<>?" : "",
  ].filter(Boolean);
  if (groups.length === 0) throw new Error("Select at least one character type.");
  const alphabet = groups.join("");
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < length) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join("");
}
