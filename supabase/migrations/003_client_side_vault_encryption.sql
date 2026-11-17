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
