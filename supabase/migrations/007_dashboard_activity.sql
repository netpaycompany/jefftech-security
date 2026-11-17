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
