-- Core vault and security schema for Jefftech Password Vault
-- See supabase/schema.sql for the full (non-migration) version.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  master_password_hint text,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, email_verified)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.email_confirmed_at is not null
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.vaults (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Primary Vault',
  description text,
  key_version text not null default 'v1',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_folders (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  name text not null,
  parent_id uuid references public.vault_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  folder_id uuid references public.vault_folders(id) on delete set null,
  item_type text not null check (item_type in ('password','note','identity','card','bank_account','recovery_code','license','document')),
  title text not null,
  encrypted_payload jsonb not null,
  tags text[] default '{}',
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_keys (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  key_version text not null,
  encrypted_vault_key text not null,
  salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_name text,
  device_type text,
  public_key text,
  trust_level text not null default 'unverified',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  token_hash text not null,
  status text not null default 'active',
  ip_address text,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.encrypted_attachments (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  item_id uuid references public.vault_items(id) on delete set null,
  file_name text not null,
  mime_type text,
  encrypted_blob text not null,
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_configurations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  recovery_method text not null default 'recovery_key',
  encrypted_recovery_key text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  theme text not null default 'dark',
  require_two_factor boolean not null default true,
  lock_after_minutes integer not null default 15,
  email_security_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vaults_profile_id on public.vaults(profile_id);
create index if not exists idx_vault_items_vault_id on public.vault_items(vault_id);
create index if not exists idx_vault_folders_vault_id on public.vault_folders(vault_id);
create index if not exists idx_devices_profile_id on public.devices(profile_id);
create index if not exists idx_sessions_profile_id on public.sessions(profile_id);
create index if not exists idx_security_events_profile_id on public.security_events(profile_id);

alter table public.profiles enable row level security;
alter table public.vaults enable row level security;
alter table public.vault_items enable row level security;
alter table public.vault_folders enable row level security;
alter table public.vault_keys enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.security_events enable row level security;
alter table public.encrypted_attachments enable row level security;
alter table public.recovery_configurations enable row level security;
alter table public.account_settings enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can manage own vaults" on public.vaults
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "Users can manage own vault items" on public.vault_items
  for all using (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  ) with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  );

create policy "Users can manage own folders" on public.vault_folders
  for all using (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  ) with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  );

create policy "Users can manage own vault keys" on public.vault_keys
  for all using (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  ) with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  );

create policy "Users can manage own devices" on public.devices
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can manage own sessions" on public.sessions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can view own security events" on public.security_events
  for select using (profile_id = auth.uid());
create policy "Users can insert own security events" on public.security_events
  for insert with check (profile_id = auth.uid());

create policy "Users can manage own encrypted attachments" on public.encrypted_attachments
  for all using (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  ) with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid())
  );

create policy "Users can manage own recovery config" on public.recovery_configurations
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can manage own account settings" on public.account_settings
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
