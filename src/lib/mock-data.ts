export type PasswordRecord = {
  id: string;
  site: string;
  username: string;
  password: string;
  email: string;
  url: string;
  folder: string;
  note: string;
  tags: string[];
  strength: "Strong" | "Medium" | "Weak";
  updated: string;
  created: string;
  favorite?: boolean;
  passwordHistory?: { password: string; changedAt: string }[];
};
