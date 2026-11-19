export type PasswordRecord = {
  site: string;
  url: string;
  username: string;
  password: string;
  email: string;
  folder: string;
  note: string;
  tags: string[];
  strength: "Strong" | "Medium" | "Weak";
  created: string;
  updated: string;
  favorite: boolean;
  passwordHistory: { password: string; changedAt: string }[];
};

export type VaultPassword = PasswordRecord & {
  id: string;
  revision: number;
};

export type PasswordSummary = Omit<VaultPassword, "password" | "note" | "passwordHistory">;

export type ExtensionTokens = {
  profileId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
};

export type VaultKeyEnvelope = {
  vault_id: string;
  key_version: string;
  encrypted_vault_key: string;
  wrapped_key_nonce: string;
  salt: string;
  algorithm: string;
  kdf_algorithm: string;
  kdf_parameters: unknown;
};

export type ExtensionSettings = {
  clipboardClearSeconds: number;
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  clipboardClearSeconds: 30,
};
