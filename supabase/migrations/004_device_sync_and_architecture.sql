create extension if not exists "pgcrypto";

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

alter table public.sessions
  drop constraint if exists sessions_status_check;
alter table public.sessions
  add constraint sessions_status_check check (status in ('active', 'revoked', 'expired'));

revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

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
  id uuid,
  device_name text,
  device_type text,
  trust_level text,
  verified_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
)
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
  if p_device_id is null
    or p_device_name is null or length(btrim(p_device_name)) not between 1 and 80
    or p_device_type is null or p_device_type not in ('web', 'extension', 'mobile', 'desktop') then
    raise exception 'Invalid device registration.';
  end if;

  insert into public.devices (id, profile_id, device_name, device_type, trust_level, last_seen_at)
  values (p_device_id, v_user_id, btrim(p_device_name), p_device_type, 'unverified', now())
  on conflict on constraint devices_pkey do update
    set device_name = excluded.device_name,
        device_type = excluded.device_type,
        last_seen_at = now()
    where public.devices.profile_id = v_user_id and public.devices.revoked_at is null;

  if not found then
    raise exception 'Device is revoked or unavailable.';
  end if;
  return query
    select d.id, d.device_name, d.device_type, d.trust_level,
      d.verified_at, d.revoked_at, d.last_seen_at
    from public.devices d
    where d.id = p_device_id and d.profile_id = v_user_id;
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
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.vaults v
    where v.profile_id = v_user_id and v.is_default
  ) then
    raise exception 'Vault setup is required before verifying this device.';
  end if;
  update public.devices
    set trust_level = 'verified', verified_at = now(), last_seen_at = now()
  where id = p_device_id and profile_id = v_user_id and revoked_at is null;
  if not found then
    raise exception 'Device is revoked or unavailable.';
  end if;
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
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  update public.devices
    set trust_level = 'revoked', revoked_at = now(), verified_at = null
  where id = p_device_id and profile_id = v_user_id and revoked_at is null;
  if not found then
    raise exception 'Device is revoked or unavailable.';
  end if;
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
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
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
