import { describe, expect, it } from "vitest";

import { analyzePasswords, generatePassword, isAllowedOrigin, originMatches, passwordStrength } from "./security";
import type { PasswordRecord } from "../types";

function record(password: string, updated = "2026-01-01"): PasswordRecord {
  return {
    site: "Example",
    url: "https://example.com",
    username: "user",
    password,
    email: "",
    folder: "General",
    note: "",
    tags: [],
    strength: passwordStrength(password),
    created: "2025-01-01",
    updated,
    favorite: false,
    passwordHistory: [],
  };
}

describe("website origin matching", () => {
  it("matches exact HTTPS origins only", () => {
    expect(originMatches("https://example.com/login", "https://example.com/other")).toBe(true);
    expect(originMatches("https://example.com", "https://sub.example.com")).toBe(false);
    expect(originMatches("http://example.com", "http://example.com")).toBe(false);
  });

  it("rejects non-origin and non-HTTPS URLs", () => {
    expect(isAllowedOrigin("https://example.com")).toBe(true);
    expect(isAllowedOrigin("https://example.com/path")).toBe(false);
    expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
  });
});

describe("password generation and local health", () => {
  it("includes each selected class and honors the requested length", () => {
    const password = generatePassword(32, { uppercase: true, lowercase: true, numbers: true, symbols: true });
    expect(password).toHaveLength(32);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  it("rejects empty character sets and out-of-range lengths", () => {
    expect(() => generatePassword(8, { uppercase: false, lowercase: false, numbers: false, symbols: false })).toThrow();
    expect(() => generatePassword(7, { uppercase: true, lowercase: false, numbers: false, symbols: false })).toThrow();
  });

  it("counts weak, reused and old passwords without returning passwords", () => {
    const metrics = analyzePasswords([
      record("short"),
      record("short"),
      record("LongerSecure!Password123", "2024-01-01"),
    ], Date.parse("2026-01-01"));
    expect(metrics).toEqual({ total: 3, weak: 2, reused: 2, old: 1 });
    expect(passwordStrength("aB1!")).toBe("Weak");
    expect(passwordStrength("mYbetterPass1")).toBe("Medium");
    expect(passwordStrength("mYbetterPass123!")).toBe("Strong");
  });
});
