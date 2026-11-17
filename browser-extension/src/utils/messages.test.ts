import { describe, expect, it } from "vitest";

import { contentMessageSchema, popupMessageSchema } from "./messages";

describe("extension message validation", () => {
  it("accepts only known popup messages with exact payload shapes", () => {
    expect(popupMessageSchema.safeParse({ type: "state" }).success).toBe(true);
    expect(popupMessageSchema.safeParse({ type: "unlock", masterPassword: "test" }).success).toBe(true);
    expect(popupMessageSchema.safeParse({ type: "unlock", masterPassword: "test", rawToken: "secret" }).success).toBe(false);
    expect(popupMessageSchema.safeParse({ type: "delete-record", id: "bad", revision: 0 }).success).toBe(false);
    expect(popupMessageSchema.safeParse({ type: "arbitrary", payload: {} }).success).toBe(false);
  });

  it("rejects malformed or oversized content-script messages", () => {
    expect(contentMessageSchema.safeParse({ type: "content:check" }).success).toBe(true);
    expect(contentMessageSchema.safeParse({ type: "content:scan" }).success).toBe(true);
    expect(contentMessageSchema.safeParse({
      type: "content:save-candidate",
      site: "Example",
      url: "javascript:alert(1)",
      username: "user",
      password: "secret",
    }).success).toBe(false);
    expect(contentMessageSchema.safeParse({
      type: "content:save-candidate",
      site: "Example",
      url: "https://example.com",
      username: "user",
      password: "x".repeat(10_001),
    }).success).toBe(false);
  });
});
