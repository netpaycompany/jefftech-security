create table if not exists public.notification_reads (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.notification_reads;
create trigger set_updated_at before update on public.notification_reads
  for each row execute function public.set_updated_at();

alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon, authenticated;
grant select, insert, update on public.notification_reads to authenticated;

drop policy if exists "Users can view own notification read state" on public.notification_reads;
create policy "Users can view own notification read state" on public.notification_reads
  for select using (profile_id = (select auth.uid()));
drop policy if exists "Users can insert own notification read state" on public.notification_reads;
create policy "Users can insert own notification read state" on public.notification_reads
  for insert with check (profile_id = (select auth.uid()));
drop policy if exists "Users can update own notification read state" on public.notification_reads;
create policy "Users can update own notification read state" on public.notification_reads
  for update using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create or replace function public.mark_security_notifications_read()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_read_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  insert into public.notification_reads (profile_id, last_read_at, updated_at)
  values (v_user_id, v_read_at, v_read_at)
  on conflict (profile_id) do update
    set last_read_at = excluded.last_read_at,
        updated_at = excluded.updated_at;
  return v_read_at;
end;
$$;

revoke all on function public.mark_security_notifications_read() from public;
grant execute on function public.mark_security_notifications_read() to authenticated;

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
    'vault_item_conflict', 'encrypted_backup_created',
    'mfa_enabled', 'mfa_disabled'
  ) or p_severity not in ('info', 'warning') then
    raise exception 'Unsupported security event.';
  end if;
  insert into public.security_events (profile_id, event_type, severity, metadata)
  values (v_user_id, p_event_type, p_severity, '{}'::jsonb);
end;
$$;

revoke all on function public.record_security_event(text, text) from public;
grant execute on function public.record_security_event(text, text) to authenticated;
