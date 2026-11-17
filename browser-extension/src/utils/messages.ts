import { z } from "zod";

const httpsUrlSchema = z.string().url().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
});

const passwordRecordSchema = z.object({
  site: z.string().max(200),
  url: httpsUrlSchema,
  username: z.string().max(500),
  password: z.string().min(1).max(10_000),
  email: z.string().max(500),
  folder: z.string().max(200),
  note: z.string().max(10_000),
  tags: z.array(z.string().max(100)).max(50),
  strength: z.enum(["Strong", "Medium", "Weak"]),
  created: z.string(),
  updated: z.string(),
  favorite: z.boolean(),
  passwordHistory: z.array(z.object({ password: z.string().max(10_000), changedAt: z.string() })).max(20),
}).strict();

export const popupMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }).strict(),
  z.object({ type: z.literal("connect") }).strict(),
  z.object({ type: z.literal("disconnect") }).strict(),
  z.object({ type: z.literal("unlock"), masterPassword: z.string().min(1).max(1024) }).strict(),
  z.object({ type: z.literal("lock") }).strict(),
  z.object({ type: z.literal("list") }).strict(),
  z.object({ type: z.literal("fill-record"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("get-record"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("save-record"), id: z.string().uuid().optional(), record: passwordRecordSchema }).strict(),
  z.object({ type: z.literal("delete-record"), id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("health") }).strict(),
  z.object({ type: z.literal("settings") }).strict(),
  z.object({
    type: z.literal("save-settings"),
    settings: z.object({ autoLockMinutes: z.number().int().min(1).max(60), clipboardClearSeconds: z.number().int().min(0).max(120) }).strict(),
  }).strict(),
  z.object({ type: z.literal("clipboard-copy"), id: z.string().uuid(), field: z.enum(["username", "password"]) }).strict(),
]);

export const contentMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("content:check") }).strict(),
  z.object({ type: z.literal("content:scan") }).strict(),
  z.object({ type: z.literal("content:fill"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("content:save-candidate"), site: z.string().max(200), url: httpsUrlSchema, username: z.string().max(500), password: z.string().min(1).max(10_000) }).strict(),
]);
