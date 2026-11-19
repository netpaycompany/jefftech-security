create table if not exists public.admin_email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  contact_email text not null,
  contact_name text,
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.admin_email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.admin_email_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  resend_email_id text unique,
  rfc_message_id text unique,
  in_reply_to text,
  from_email text not null,
  to_email text not null,
  subject text not null,
  text_body text not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'delivered', 'opened', 'bounced', 'failed', 'received')),
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_email_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

create index if not exists idx_admin_email_threads_last_message
  on public.admin_email_threads(last_message_at desc);
create index if not exists idx_admin_email_threads_contact_email
  on public.admin_email_threads(lower(contact_email));
create index if not exists idx_admin_email_messages_thread_created
  on public.admin_email_messages(thread_id, created_at);
create index if not exists idx_admin_email_messages_in_reply_to
  on public.admin_email_messages(in_reply_to);

alter table public.admin_email_threads enable row level security;
alter table public.admin_email_messages enable row level security;
alter table public.admin_email_webhook_events enable row level security;

revoke all on public.admin_email_threads from anon, authenticated;
revoke all on public.admin_email_messages from anon, authenticated;
revoke all on public.admin_email_webhook_events from anon, authenticated;
