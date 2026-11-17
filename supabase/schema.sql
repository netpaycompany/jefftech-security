-- Full schema snapshot, including client-side encryption and browser extension migrations.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone_number text check (char_length(phone_number) <= 32),
  address text check (char_length(address) <= 300),
  country text check (char_length(country) <= 100),
  referral_code text check (
    char_length(referral_code) <= 64
    and referral_code ~ '^[A-Z0-9_-]+$'
  ),
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
  insert into public.profiles (
    id,
    email,
    full_name,
    phone_number,
    country,
    referral_code,
    email_verified
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'country'), ''),
    nullif(upper(btrim(new.raw_user_meta_data ->> 'referral_code')), ''),
    new.email_confirmed_at is not null
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
        country = coalesce(public.profiles.country, excluded.country),
        referral_code = coalesce(public.profiles.referral_code, excluded.referral_code),
        email_verified = excluded.email_verified,
        updated_at = now();
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

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can manage own vaults" on public.vaults for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "Users can manage own vault items" on public.vault_items for all using (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
);

create policy "Users can manage own folders" on public.vault_folders for all using (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
);

create policy "Users can manage own vault keys" on public.vault_keys for all using (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
);

create policy "Users can manage own devices" on public.devices for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can manage own sessions" on public.sessions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can view own security events" on public.security_events for select using (profile_id = auth.uid());
create policy "Users can insert own security events" on public.security_events for insert with check (profile_id = auth.uid());
create policy "Users can manage own encrypted attachments" on public.encrypted_attachments for all using (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.vaults v where v.id = vault_id and v.profile_id = auth.uid()
  )
);
create policy "Users can manage own recovery config" on public.recovery_configurations for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Users can manage own account settings" on public.account_settings for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());


-- Client-side encryption, RLS restrictions, and authenticated write RPCs.
do $$
begin
  if exists (select 1 from public.vaults)
    or exists (select 1 from public.vault_items)
    or exists (select 1 from public.vault_keys)
    or exists (select 1 from public.vault_folders)
    or exists (select 1 from public.encrypted_attachments) then
    raise exception 'Vault data already exists. Export and encrypt existing vault data with an authorized client before applying this migration.';
  end if;
end;
$$;

alter table public.profiles
  drop column if exists master_password_hint;

alter table public.vault_keys
  add column if not exists wrapped_key_nonce text,
  add column if not exists algorithm text,
  add column if not exists kdf_algorithm text,
  add column if not exists kdf_parameters jsonb,
  add column if not exists recovery_ciphertext text,
  add column if not exists recovery_nonce text;

create unique index if not exists idx_vault_keys_vault_version
  on public.vault_keys(vault_id, key_version);

create unique index if not exists idx_vaults_one_default_per_profile
  on public.vaults(profile_id) where is_default;

alter table public.vault_items
  add column if not exists revision integer not null default 1;

alter table public.vault_items
  drop constraint if exists vault_items_revision_positive;

alter table public.vault_items
  add constraint vault_items_revision_positive check (revision > 0);

drop policy if exists "Users can manage own vaults" on public.vaults;
drop policy if exists "Users can read own vaults" on public.vaults;
create policy "Users can read own vaults" on public.vaults
  for select using (profile_id = (select auth.uid()));

drop policy if exists "Users can manage own vault items" on public.vault_items;
drop policy if exists "Users can read own vault items" on public.vault_items;
create policy "Users can read own vault items" on public.vault_items
  for select using (
    exists (
      select 1 from public.vaults v
      where v.id = vault_id and v.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage own vault keys" on public.vault_keys;
drop policy if exists "Users can read own vault keys" on public.vault_keys;
create policy "Users can read own vault keys" on public.vault_keys
  for select using (
    exists (
      select 1 from public.vaults v
      where v.id = vault_id and v.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage own folders" on public.vault_folders;
drop policy if exists "Users can read own folders" on public.vault_folders;
create policy "Users can read own folders" on public.vault_folders
  for select using (
    exists (
      select 1
      from public.vaults v
      where v.id = vault_id and v.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage own encrypted attachments" on public.encrypted_attachments;
drop policy if exists "Users can read own encrypted attachments" on public.encrypted_attachments;
create policy "Users can read own encrypted attachments" on public.encrypted_attachments
  for select using (
    exists (
      select 1
      from public.vaults v
      where v.id = vault_id and v.profile_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.vaults from anon, authenticated;
revoke insert, update, delete on public.vault_items from anon, authenticated;
revoke insert, update, delete on public.vault_keys from anon, authenticated;
revoke all on public.vault_folders from anon, authenticated;
revoke all on public.encrypted_attachments from anon, authenticated;
grant select on public.vaults to authenticated;
grant select on public.vault_items to authenticated;
grant select on public.vault_keys to authenticated;

create or replace function public.is_valid_vault_key_envelope(
  p_envelope jsonb,
  p_expected_version text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_envelope) = 'object'
    and p_envelope ->> 'algorithm' = 'AES-256-GCM'
    and p_envelope ->> 'key_version' = p_expected_version
    and p_envelope ->> 'kdf_algorithm' = 'Argon2id'
    and p_envelope -> 'kdf_parameters' =
      '{"memoryKiB":65536,"iterations":3,"parallelism":1,"hashLength":32}'::jsonb
    and p_envelope ->> 'salt' ~ '^[A-Za-z0-9+/]{22}==$'
    and p_envelope ->> 'nonce' ~ '^[A-Za-z0-9+/]{16}$'
    and length(p_envelope ->> 'ciphertext') = 64
    and p_envelope ->> 'ciphertext' ~
      '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    and p_envelope ->> 'recovery_nonce' ~ '^[A-Za-z0-9+/]{16}$'
    and length(p_envelope ->> 'recovery_ciphertext') = 64
    and p_envelope ->> 'recovery_ciphertext' ~
      '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
    false
  );
$$;

create or replace function public.initialize_encrypted_vault(
  p_vault_id uuid,
  p_envelope jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing_vault_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_vault_id is null or not public.is_valid_vault_key_envelope(p_envelope, 'v1') then
    raise exception 'Invalid encrypted vault configuration.';
  end if;
  select id into v_existing_vault_id
  from public.vaults
  where profile_id = v_user_id and is_default
  for update;
  if found then
    if v_existing_vault_id = p_vault_id and exists (
      select 1 from public.vault_keys
      where vault_id = p_vault_id
        and key_version = 'v1'
        and encrypted_vault_key = p_envelope ->> 'ciphertext'
        and wrapped_key_nonce = p_envelope ->> 'nonce'
        and salt = p_envelope ->> 'salt'
        and recovery_ciphertext = p_envelope ->> 'recovery_ciphertext'
        and recovery_nonce = p_envelope ->> 'recovery_nonce'
    ) then
      return;
    end if;
    raise exception 'A default vault already exists.';
  end if;

  insert into public.vaults (id, profile_id, name, key_version, is_default)
  values (p_vault_id, v_user_id, 'Primary Vault', 'v1', true);

  insert into public.vault_keys (
    vault_id, key_version, encrypted_vault_key, salt, wrapped_key_nonce,
    algorithm, kdf_algorithm, kdf_parameters, recovery_ciphertext, recovery_nonce
  )
  values (
    p_vault_id, 'v1', p_envelope ->> 'ciphertext', p_envelope ->> 'salt',
    p_envelope ->> 'nonce', p_envelope ->> 'algorithm',
    p_envelope ->> 'kdf_algorithm', p_envelope -> 'kdf_parameters',
    p_envelope ->> 'recovery_ciphertext', p_envelope ->> 'recovery_nonce'
  );
end;
$$;

create or replace function public.save_encrypted_vault_item(
  p_vault_id uuid,
  p_item_id uuid,
  p_item_type text,
  p_key_version text,
  p_nonce text,
  p_ciphertext text,
  p_expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_version text;
  v_revision integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select key_version into v_current_version
  from public.vaults
  where id = p_vault_id and profile_id = v_user_id and is_default
  for update;
  if not found then
    raise exception 'Vault not found.';
  end if;
  if p_key_version is distinct from v_current_version then
    raise exception 'Vault key version changed; unlock the vault again.';
  end if;
  if p_item_id is null or p_item_type is null or p_item_type not in (
    'password', 'note', 'identity', 'card', 'bank_account',
    'recovery_code', 'license', 'document'
  ) then
    raise exception 'Invalid encrypted item type.';
  end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9+/]{16}$'
    or p_ciphertext is null
    or length(p_ciphertext) < 44
    or p_ciphertext !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    or length(p_ciphertext) > 5592408 then
    raise exception 'Invalid encrypted item envelope.';
  end if;

  if p_expected_revision is null then
    insert into public.vault_items (
      id, vault_id, item_type, title, encrypted_payload, tags, revision
    )
    values (
      p_item_id, p_vault_id, p_item_type, 'Encrypted item',
      jsonb_build_object(
        'algorithm', 'AES-256-GCM',
        'key_version', p_key_version,
        'nonce', p_nonce,
        'ciphertext', p_ciphertext
      ),
      '{}'::text[], 1
    );
    return 1;
  end if;

  update public.vault_items
  set item_type = p_item_type,
      title = 'Encrypted item',
      tags = '{}'::text[],
      encrypted_payload = jsonb_build_object(
        'algorithm', 'AES-256-GCM',
        'key_version', p_key_version,
        'nonce', p_nonce,
        'ciphertext', p_ciphertext
      ),
      revision = revision + 1,
      updated_at = now()
  where id = p_item_id
    and vault_id = p_vault_id
    and revision = p_expected_revision
  returning revision into v_revision;

  if not found then
    raise exception 'Vault item changed or no longer exists.';
  end if;
  return v_revision;
end;
$$;

create or replace function public.delete_encrypted_vault_item(
  p_vault_id uuid,
  p_item_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  perform 1 from public.vaults
  where id = p_vault_id and profile_id = v_user_id and is_default
  for update;
  if not found then
    raise exception 'Vault not found.';
  end if;

  delete from public.vault_items
  where id = p_item_id and vault_id = p_vault_id and revision = p_expected_revision;
  if not found then
    raise exception 'Vault item changed or no longer exists.';
  end if;
end;
$$;

create or replace function public.recover_encrypted_vault(
  p_vault_id uuid,
  p_key_version text,
  p_master_envelope jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recovery_ciphertext text;
  v_recovery_nonce text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  perform 1 from public.vaults
  where id = p_vault_id and profile_id = v_user_id and key_version = p_key_version
  for update;
  if not found then
    raise exception 'Invalid encrypted vault configuration.';
  end if;
  select recovery_ciphertext, recovery_nonce
    into v_recovery_ciphertext, v_recovery_nonce
  from public.vault_keys
  where vault_id = p_vault_id and key_version = p_key_version
  for update;
  if not found
    or p_master_envelope ->> 'recovery_ciphertext' is distinct from v_recovery_ciphertext
    or p_master_envelope ->> 'recovery_nonce' is distinct from v_recovery_nonce
    or not public.is_valid_vault_key_envelope(p_master_envelope, p_key_version) then
    raise exception 'Invalid encrypted vault configuration.';
  end if;

  update public.vault_keys
  set encrypted_vault_key = p_master_envelope ->> 'ciphertext',
      salt = p_master_envelope ->> 'salt',
      wrapped_key_nonce = p_master_envelope ->> 'nonce',
      algorithm = p_master_envelope ->> 'algorithm',
      kdf_algorithm = p_master_envelope ->> 'kdf_algorithm',
      kdf_parameters = p_master_envelope -> 'kdf_parameters'
  where vault_id = p_vault_id and key_version = p_key_version;
  if not found then
    raise exception 'Encrypted vault key not found.';
  end if;
end;
$$;

create or replace function public.rotate_encrypted_vault(
  p_vault_id uuid,
  p_old_version text,
  p_new_envelope jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_version text;
  v_item jsonb;
  v_item_id uuid;
  v_expected_revision integer;
  v_item_type text;
  v_seen_ids uuid[] := '{}';
  v_expected_version text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  select key_version into v_current_version
  from public.vaults
  where id = p_vault_id and profile_id = v_user_id and is_default
  for update;
  if not found or v_current_version is distinct from p_old_version then
    raise exception 'Vault key version changed; unlock the vault again.';
  end if;
  if p_old_version !~ '^v[1-9][0-9]*$' or length(p_old_version) > 10 then
    raise exception 'Invalid vault key version.';
  end if;
  v_expected_version := 'v' || ((substring(p_old_version from 2)::integer) + 1)::text;
  if p_new_envelope ->> 'key_version' is distinct from v_expected_version
    or not public.is_valid_vault_key_envelope(p_new_envelope, p_new_envelope ->> 'key_version')
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid vault rotation request.';
  end if;
  if jsonb_array_length(p_items) <> (
    select count(*) from public.vault_items where vault_id = p_vault_id
  ) then
    raise exception 'Vault contents changed; reload before rotating the key.';
  end if;

  perform 1 from public.vault_items where vault_id = p_vault_id for update;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item ->> 'id')::uuid;
    v_expected_revision := (v_item ->> 'expected_revision')::integer;
    v_item_type := v_item ->> 'item_type';

    if v_item_id is null
      or v_expected_revision is null
      or v_item_id = any(v_seen_ids)
      or v_item_type is null
      or v_item_type not in (
        'password', 'note', 'identity', 'card', 'bank_account',
        'recovery_code', 'license', 'document'
      )
      or v_item ->> 'nonce' is null
      or v_item ->> 'nonce' !~ '^[A-Za-z0-9+/]{16}$'
      or v_item ->> 'ciphertext' is null
      or length(v_item ->> 'ciphertext') < 44
      or length(v_item ->> 'ciphertext') > 5592408
      or v_item ->> 'ciphertext' !~
        '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
      raise exception 'Invalid encrypted item envelope.';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);

    update public.vault_items
    set item_type = v_item_type,
        title = 'Encrypted item',
        tags = '{}'::text[],
        encrypted_payload = jsonb_build_object(
          'algorithm', 'AES-256-GCM',
          'key_version', p_new_envelope ->> 'key_version',
          'nonce', v_item ->> 'nonce',
          'ciphertext', v_item ->> 'ciphertext'
        ),
        revision = revision + 1,
        updated_at = now()
    where id = v_item_id
      and vault_id = p_vault_id
      and revision = v_expected_revision;
    if not found then
      raise exception 'Vault contents changed; reload before rotating the key.';
    end if;
  end loop;

  delete from public.vault_keys where vault_id = p_vault_id;
  insert into public.vault_keys (
    vault_id, key_version, encrypted_vault_key, salt, wrapped_key_nonce,
    algorithm, kdf_algorithm, kdf_parameters, recovery_ciphertext, recovery_nonce
  )
  values (
    p_vault_id, p_new_envelope ->> 'key_version', p_new_envelope ->> 'ciphertext',
    p_new_envelope ->> 'salt', p_new_envelope ->> 'nonce',
    p_new_envelope ->> 'algorithm', p_new_envelope ->> 'kdf_algorithm',
    p_new_envelope -> 'kdf_parameters', p_new_envelope ->> 'recovery_ciphertext',
    p_new_envelope ->> 'recovery_nonce'
  );
  update public.vaults
  set key_version = p_new_envelope ->> 'key_version',
      updated_at = now()
  where id = p_vault_id and profile_id = v_user_id;
end;
$$;

revoke all on function public.is_valid_vault_key_envelope(jsonb, text) from public;
revoke all on function public.initialize_encrypted_vault(uuid, jsonb) from public;
revoke all on function public.save_encrypted_vault_item(uuid, uuid, text, text, text, text, integer) from public;
revoke all on function public.delete_encrypted_vault_item(uuid, uuid, integer) from public;
revoke all on function public.recover_encrypted_vault(uuid, text, jsonb) from public;
revoke all on function public.rotate_encrypted_vault(uuid, text, jsonb, jsonb) from public;

grant execute on function public.initialize_encrypted_vault(uuid, jsonb) to authenticated;
grant execute on function public.save_encrypted_vault_item(uuid, uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.delete_encrypted_vault_item(uuid, uuid, integer) to authenticated;
grant execute on function public.recover_encrypted_vault(uuid, text, jsonb) to authenticated;
grant execute on function public.rotate_encrypted_vault(uuid, text, jsonb, jsonb) to authenticated;

-- Device synchronization and account architecture migration snapshot.
alter table public.devices
  add column if not exists verified_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists idx_devices_profile_status
  on public.devices(profile_id, revoked_at, verified_at);
create unique index if not exists idx_account_settings_profile
  on public.account_settings(profile_id);
create unique index if not exists idx_vault_folders_vault_name_parent
  on public.vault_folders(vault_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists idx_vault_items_vault_updated
  on public.vault_items(vault_id, updated_at desc);
create index if not exists idx_security_events_profile_created
  on public.security_events(profile_id, created_at desc);
create index if not exists idx_sessions_profile_status_expiry
  on public.sessions(profile_id, status, expires_at);

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions
  add constraint sessions_status_check check (status in ('active', 'revoked', 'expired'));

revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone_number, address, country, referral_code) on public.profiles to authenticated;

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null default 'free' check (plan_code in ('free', 'premium', 'family', 'business')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'suspended')),
  storage_quota_bytes bigint not null default 104857600 check (storage_quota_bytes >= 0),
  billing_customer_ref text,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);
alter table public.account_subscriptions enable row level security;
drop policy if exists "Users can view own subscription" on public.account_subscriptions;
create policy "Users can view own subscription" on public.account_subscriptions
  for select using (profile_id = (select auth.uid()));
revoke all on public.account_subscriptions from anon, authenticated;
grant select on public.account_subscriptions to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'vaults', 'vault_folders', 'vault_items', 'vault_keys',
    'devices', 'sessions', 'encrypted_attachments', 'recovery_configurations',
    'account_settings', 'account_subscriptions'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', v_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      v_table
    );
  end loop;
end;
$$;

drop policy if exists "Users can manage own devices" on public.devices;
drop policy if exists "Users can view own devices" on public.devices;
create policy "Users can view own devices" on public.devices
  for select using (profile_id = (select auth.uid()));
revoke insert, update, delete on public.devices from anon, authenticated;
grant select on public.devices to authenticated;

revoke all on public.sessions from anon, authenticated;
drop policy if exists "Users can manage own sessions" on public.sessions;
drop policy if exists "Users can insert own security events" on public.security_events;
revoke insert, update, delete on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;

create or replace function public.register_vault_device(
  p_device_id uuid,
  p_device_name text,
  p_device_type text
)
returns table (
  id uuid, device_name text, device_type text, trust_level text,
  verified_at timestamptz, revoked_at timestamptz, last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_device_id is null
    or p_device_name is null or length(btrim(p_device_name)) not between 1 and 80
    or p_device_type is null or p_device_type not in ('web', 'extension', 'mobile', 'desktop') then
    raise exception 'Invalid device registration.';
  end if;

  insert into public.devices (id, profile_id, device_name, device_type, trust_level, last_seen_at)
  values (p_device_id, v_user_id, btrim(p_device_name), p_device_type, 'unverified', now())
  on conflict (id) do update
    set device_name = excluded.device_name,
        device_type = excluded.device_type,
        last_seen_at = now()
    where public.devices.profile_id = v_user_id and public.devices.revoked_at is null;
  if not found then raise exception 'Device is revoked or unavailable.'; end if;

  return query select d.id, d.device_name, d.device_type, d.trust_level,
    d.verified_at, d.revoked_at, d.last_seen_at
    from public.devices d where d.id = p_device_id and d.profile_id = v_user_id;
end;
$$;

create or replace function public.verify_vault_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if not exists (select 1 from public.vaults v where v.profile_id = v_user_id and v.is_default) then
    raise exception 'Vault setup is required before verifying this device.';
  end if;
  update public.devices set trust_level = 'verified', verified_at = now(), last_seen_at = now()
    where id = p_device_id and profile_id = v_user_id and revoked_at is null;
  if not found then raise exception 'Device is revoked or unavailable.'; end if;
end;
$$;

create or replace function public.revoke_vault_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  update public.devices set trust_level = 'revoked', revoked_at = now(), verified_at = null
    where id = p_device_id and profile_id = v_user_id and revoked_at is null;
  if not found then raise exception 'Device is revoked or unavailable.'; end if;
end;
$$;

create or replace function public.record_security_event(
  p_event_type text,
  p_severity text default 'info'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_event_type is null or p_event_type not in (
    'device_registered', 'device_verified', 'device_revoked',
    'vault_item_conflict', 'encrypted_backup_created'
  ) or p_severity not in ('info', 'warning') then
    raise exception 'Unsupported security event.';
  end if;
  insert into public.security_events (profile_id, event_type, severity, metadata)
    values (v_user_id, p_event_type, p_severity, '{}'::jsonb);
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.register_vault_device(uuid, text, text) from public;
revoke all on function public.verify_vault_device(uuid) from public;
revoke all on function public.revoke_vault_device(uuid) from public;
revoke all on function public.record_security_event(text, text) from public;
grant execute on function public.register_vault_device(uuid, text, text) to authenticated;
grant execute on function public.verify_vault_device(uuid) to authenticated;
grant execute on function public.revoke_vault_device(uuid) to authenticated;
grant execute on function public.record_security_event(text, text) to authenticated;

create table if not exists public.vault_activity (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vault_id uuid references public.vaults(id) on delete set null,
  item_id uuid not null,
  item_type text not null check (item_type in (
    'password', 'note', 'identity', 'card', 'bank_account',
    'recovery_code', 'license', 'document'
  )),
  event_type text not null check (event_type in ('created', 'updated', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_vault_activity_profile_created
  on public.vault_activity(profile_id, created_at desc);

alter table public.vault_activity enable row level security;
drop policy if exists "Users can view own vault activity" on public.vault_activity;
create policy "Users can view own vault activity" on public.vault_activity
  for select using (profile_id = (select auth.uid()));
revoke all on public.vault_activity from anon, authenticated;
grant select on public.vault_activity to authenticated;

create or replace function public.capture_vault_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_vault_id uuid;
  v_item_id uuid;
  v_item_type text;
  v_event_type text;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    v_vault_id := old.vault_id;
    v_item_id := old.id;
    v_item_type := old.item_type;
    v_event_type := 'deleted';
  else
    v_vault_id := new.vault_id;
    v_item_id := new.id;
    v_item_type := new.item_type;
    v_event_type := case when tg_op = 'INSERT' then 'created' else 'updated' end;
  end if;

  select profile_id into v_profile_id
  from public.vaults
  where id = v_vault_id;

  if v_profile_id is not null then
    insert into public.vault_activity (
      profile_id, vault_id, item_id, item_type, event_type
    )
    values (
      v_profile_id, v_vault_id, v_item_id, v_item_type, v_event_type
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_vault_item_activity on public.vault_items;
create trigger capture_vault_item_activity
  after insert or update or delete on public.vault_items
  for each row execute function public.capture_vault_item_activity();

revoke all on function public.capture_vault_item_activity() from public;

-- Migration 008: browser extension authorization and session-scoped vault access.
create table if not exists public.extension_authorizations (
  code_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_extension_sessions_profile_created
  on public.extension_sessions(profile_id, created_at desc);
create index if not exists idx_extension_authorizations_expiry
  on public.extension_authorizations(expires_at);

alter table public.extension_authorizations enable row level security;
alter table public.extension_sessions enable row level security;
revoke all on public.extension_authorizations from anon, authenticated;
revoke all on public.extension_sessions from anon, authenticated;

create or replace function public.create_extension_authorization(
  p_code text,
  p_code_challenge text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{43}$'
    or p_code_challenge is null or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid extension authorization request.';
  end if;

  delete from public.extension_authorizations where expires_at <= now();
  delete from public.extension_sessions where refresh_expires_at <= now();

  insert into public.extension_authorizations (
    code_hash, profile_id, code_challenge, expires_at
  )
  values (
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code, 'UTF8')), 'hex'),
    v_user_id,
    p_code_challenge,
    now() + interval '2 minutes'
  );
end;
$$;

create or replace function public.exchange_extension_authorization(
  p_code text,
  p_code_verifier text
)
returns table (
  profile_id uuid,
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_expected_challenge text;
  v_access_token text;
  v_refresh_token text;
  v_access_expires_at timestamptz := now() + interval '15 minutes';
  v_refresh_expires_at timestamptz := now() + interval '30 days';
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{43}$'
    or p_code_verifier is null or p_code_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then
    raise exception 'Invalid or expired extension authorization.';
  end if;

  v_expected_challenge := pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_code_verifier, 'UTF8')),
        'base64'
      ),
      '+/',
      '-_'
    ),
    '='
  );

  delete from public.extension_authorizations a
  where a.code_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code, 'UTF8')), 'hex')
    and a.code_challenge = v_expected_challenge
    and a.expires_at > now()
  returning a.profile_id into v_user_id;
  if v_user_id is null then
    raise exception 'Invalid or expired extension authorization.';
  end if;

  v_access_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_refresh_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.extension_sessions (
    profile_id,
    access_token_hash,
    refresh_token_hash,
    access_expires_at,
    refresh_expires_at
  )
  values (
    v_user_id,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_access_token, 'UTF8')), 'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_refresh_token, 'UTF8')), 'hex'),
    v_access_expires_at,
    v_refresh_expires_at
  );

  insert into public.security_events (profile_id, event_type, severity, metadata)
  values (v_user_id, 'extension_authorized', 'info', '{}'::jsonb);

  return query
    select v_user_id, v_access_token, v_refresh_token,
      v_access_expires_at, v_refresh_expires_at;
end;
$$;

create or replace function public.refresh_extension_session(p_refresh_token text)
returns table (
  profile_id uuid,
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_user_id uuid;
  v_access_token text;
  v_new_refresh_token text;
  v_access_expires_at timestamptz := now() + interval '15 minutes';
  v_refresh_expires_at timestamptz := now() + interval '30 days';
begin
  if p_refresh_token is null or p_refresh_token !~ '^[0-9a-f]{64}$' then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;

  select s.id, s.profile_id into v_session_id, v_user_id
  from public.extension_sessions s
  where s.refresh_token_hash =
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_refresh_token, 'UTF8')), 'hex')
    and s.refresh_expires_at > now()
    and s.revoked_at is null
  for update;
  if v_session_id is null then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;

  v_access_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_new_refresh_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.extension_sessions
  set access_token_hash =
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_access_token, 'UTF8')), 'hex'),
      refresh_token_hash =
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_new_refresh_token, 'UTF8')), 'hex'),
      last_used_at = now(),
      access_expires_at = v_access_expires_at,
      refresh_expires_at = v_refresh_expires_at
  where id = v_session_id;

  return query
    select v_user_id, v_access_token, v_new_refresh_token,
      v_access_expires_at, v_refresh_expires_at;
end;
$$;

create or replace function public.extension_user_for_access_token(p_access_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_access_token is null or p_access_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select s.profile_id into v_user_id
  from public.extension_sessions s
  where s.access_token_hash =
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex')
    and s.access_expires_at > now()
    and s.refresh_expires_at > now()
    and s.revoked_at is null;

  if v_user_id is not null then
    update public.extension_sessions
    set last_used_at = now()
    where access_token_hash =
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex');
  end if;
  return v_user_id;
end;
$$;

create or replace function public.get_extension_vault(p_access_token text)
returns table (
  vault_id uuid,
  key_version text,
  encrypted_vault_key text,
  wrapped_key_nonce text,
  salt text,
  algorithm text,
  kdf_algorithm text,
  kdf_parameters jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.extension_user_for_access_token(p_access_token);
begin
  if v_user_id is null then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;
  return query
    select v.id, v.key_version, k.encrypted_vault_key, k.wrapped_key_nonce,
      k.salt, k.algorithm, k.kdf_algorithm, k.kdf_parameters
    from public.vaults v
    join public.vault_keys k
      on k.vault_id = v.id and k.key_version = v.key_version
    where v.profile_id = v_user_id and v.is_default;
end;
$$;

create or replace function public.validate_extension_session(p_access_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.extension_user_for_access_token(p_access_token) is not null;
$$;

create or replace function public.list_extension_passwords(p_access_token text)
returns table (
  id uuid,
  revision integer,
  encrypted_payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.extension_user_for_access_token(p_access_token);
begin
  if v_user_id is null then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;
  return query
    select i.id, i.revision, i.encrypted_payload
    from public.vault_items i
    join public.vaults v on v.id = i.vault_id
    where v.profile_id = v_user_id and v.is_default and i.item_type = 'password'
    order by i.id;
end;
$$;

create or replace function public.save_extension_password(
  p_access_token text,
  p_item_id uuid,
  p_key_version text,
  p_nonce text,
  p_ciphertext text,
  p_expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.extension_user_for_access_token(p_access_token);
  v_vault_id uuid;
  v_key_version text;
  v_revision integer;
begin
  if v_user_id is null then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;
  if p_item_id is null
    or p_key_version is null or p_key_version !~ '^v[1-9][0-9]*$'
    or p_nonce is null or p_nonce !~ '^[A-Za-z0-9+/]{16}$'
    or p_ciphertext is null
    or length(p_ciphertext) < 44 or length(p_ciphertext) > 5592408
    or p_ciphertext !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
    raise exception 'Invalid encrypted password record.';
  end if;

  select v.id, v.key_version into v_vault_id, v_key_version
  from public.vaults v
  where v.profile_id = v_user_id and v.is_default
  for update;
  if v_vault_id is null then
    raise exception 'Vault not found.';
  end if;
  if p_key_version is distinct from v_key_version then
    raise exception 'Vault key version changed; unlock the vault again.';
  end if;

  if p_expected_revision is null then
    insert into public.vault_items (
      id, vault_id, item_type, title, tags, encrypted_payload, revision
    )
    values (
      p_item_id,
      v_vault_id,
      'password',
      'Encrypted item',
      '{}'::text[],
      jsonb_build_object(
        'algorithm', 'AES-256-GCM',
        'key_version', p_key_version,
        'nonce', p_nonce,
        'ciphertext', p_ciphertext
      ),
      1
    );
    return 1;
  end if;

  if p_expected_revision < 1 then
    raise exception 'Invalid vault item revision.';
  end if;
  update public.vault_items i
  set title = 'Encrypted item',
      tags = '{}'::text[],
      encrypted_payload = jsonb_build_object(
        'algorithm', 'AES-256-GCM',
        'key_version', p_key_version,
        'nonce', p_nonce,
        'ciphertext', p_ciphertext
      ),
      revision = i.revision + 1,
      updated_at = now()
  where i.id = p_item_id
    and i.vault_id = v_vault_id
    and i.item_type = 'password'
    and i.revision = p_expected_revision
  returning i.revision into v_revision;
  if not found then
    raise exception 'Vault item changed or no longer exists.';
  end if;
  return v_revision;
end;
$$;

create or replace function public.delete_extension_password(
  p_access_token text,
  p_item_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.extension_user_for_access_token(p_access_token);
  v_vault_id uuid;
begin
  if v_user_id is null then
    raise exception 'The extension session has expired. Connect your account again.';
  end if;
  select v.id into v_vault_id
  from public.vaults v
  where v.profile_id = v_user_id and v.is_default
  for update;
  if v_vault_id is null then
    raise exception 'Vault not found.';
  end if;
  delete from public.vault_items i
  where i.id = p_item_id
    and i.vault_id = v_vault_id
    and i.item_type = 'password'
    and i.revision = p_expected_revision;
  if not found then
    raise exception 'Vault item changed or no longer exists.';
  end if;
end;
$$;

create or replace function public.revoke_extension_session(p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_refresh_token is null or p_refresh_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  update public.extension_sessions
  set revoked_at = coalesce(revoked_at, now())
  where refresh_token_hash =
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_refresh_token, 'UTF8')), 'hex')
    and revoked_at is null
  returning profile_id into v_user_id;
  if v_user_id is not null then
    insert into public.security_events (profile_id, event_type, severity, metadata)
    values (v_user_id, 'extension_revoked', 'info', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.list_my_extension_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_used_at timestamptz,
  refresh_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.last_used_at, s.refresh_expires_at
  from public.extension_sessions s
  where s.profile_id = (select auth.uid())
    and s.revoked_at is null
    and s.refresh_expires_at > now()
  order by s.created_at desc;
$$;

create or replace function public.revoke_my_extension_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  update public.extension_sessions
  set revoked_at = coalesce(revoked_at, now())
  where id = p_session_id
    and profile_id = v_user_id
    and revoked_at is null;
  if not found then
    raise exception 'The extension session was not found or was already revoked.';
  end if;
  insert into public.security_events (profile_id, event_type, severity, metadata)
  values (v_user_id, 'extension_revoked', 'info', '{}'::jsonb);
end;
$$;

revoke all on function public.create_extension_authorization(text, text) from public, anon, authenticated;
revoke all on function public.exchange_extension_authorization(text, text) from public, anon, authenticated;
revoke all on function public.refresh_extension_session(text) from public, anon, authenticated;
revoke all on function public.extension_user_for_access_token(text) from public, anon, authenticated;
revoke all on function public.validate_extension_session(text) from public, anon, authenticated;
revoke all on function public.get_extension_vault(text) from public, anon, authenticated;
revoke all on function public.list_extension_passwords(text) from public, anon, authenticated;
revoke all on function public.save_extension_password(text, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.delete_extension_password(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.revoke_extension_session(text) from public, anon, authenticated;
revoke all on function public.list_my_extension_sessions() from public, anon, authenticated;
revoke all on function public.revoke_my_extension_session(uuid) from public, anon, authenticated;

grant execute on function public.create_extension_authorization(text, text) to authenticated;
grant execute on function public.exchange_extension_authorization(text, text) to anon, authenticated;
grant execute on function public.refresh_extension_session(text) to anon, authenticated;
grant execute on function public.validate_extension_session(text) to anon, authenticated;
grant execute on function public.get_extension_vault(text) to anon, authenticated;
grant execute on function public.list_extension_passwords(text) to anon, authenticated;
grant execute on function public.save_extension_password(text, uuid, text, text, text, integer) to anon, authenticated;
grant execute on function public.delete_extension_password(text, uuid, integer) to anon, authenticated;
grant execute on function public.revoke_extension_session(text) to anon, authenticated;
grant execute on function public.list_my_extension_sessions() to authenticated;
grant execute on function public.revoke_my_extension_session(uuid) to authenticated;
