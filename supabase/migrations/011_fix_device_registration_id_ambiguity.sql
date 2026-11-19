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
