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
