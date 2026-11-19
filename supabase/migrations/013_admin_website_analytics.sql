create table if not exists public.website_visits (
  visit_id uuid primary key,
  session_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  page_path text not null check (
    char_length(page_path) between 1 and 300
    and left(page_path, 1) = '/'
    and position('?' in page_path) = 0
    and position('#' in page_path) = 0
  ),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 7200)
);

create index if not exists idx_website_visits_last_seen
  on public.website_visits(last_seen_at desc);
create index if not exists idx_website_visits_session
  on public.website_visits(session_id, profile_id, last_seen_at desc);
create index if not exists idx_website_visits_profile
  on public.website_visits(profile_id, last_seen_at desc);
create index if not exists idx_website_visits_country
  on public.website_visits(country_code, last_seen_at desc);
create index if not exists idx_website_visits_page
  on public.website_visits(page_path, last_seen_at desc);

alter table public.website_visits enable row level security;
revoke all on public.website_visits from public, anon, authenticated;

create or replace function public.record_website_visit(
  p_visit_id uuid,
  p_session_id uuid,
  p_profile_id uuid,
  p_page_path text,
  p_country_code text,
  p_duration_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.website_visits (
    visit_id,
    session_id,
    profile_id,
    page_path,
    country_code,
    duration_seconds
  )
  values (
    p_visit_id,
    p_session_id,
    p_profile_id,
    p_page_path,
    p_country_code,
    p_duration_seconds
  )
  on conflict (visit_id) do update
    set profile_id = coalesce(public.website_visits.profile_id, excluded.profile_id),
        country_code = coalesce(excluded.country_code, public.website_visits.country_code),
        duration_seconds = greatest(public.website_visits.duration_seconds, excluded.duration_seconds),
        last_seen_at = now()
  where public.website_visits.session_id = excluded.session_id
    and public.website_visits.page_path = excluded.page_path;
end;
$$;

revoke all on function public.record_website_visit(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_website_visit(uuid, uuid, uuid, text, text, integer) to service_role;

create or replace function public.get_admin_website_analytics(p_now timestamptz default now())
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with recent_visits as (
    select
      visit.visit_id,
      visit.session_id,
      visit.profile_id,
      visit.page_path,
      visit.country_code,
      visit.last_seen_at,
      visit.duration_seconds
    from public.website_visits as visit
    where visit.last_seen_at >= p_now - interval '90 days'
  ),
  session_stats as (
    select
      visit.session_id,
      visit.profile_id,
      max(visit.last_seen_at) as last_seen_at,
      max(visit.country_code) as country_code,
      count(*)::integer as page_views,
      sum(visit.duration_seconds)::integer as duration_seconds,
      array_agg(distinct visit.page_path order by visit.page_path) as pages
    from recent_visits as visit
    group by visit.session_id, visit.profile_id
  ),
  signup_days as (
    select
      generate_series(
        date_trunc('day', p_now at time zone 'UTC') - interval '29 days',
        date_trunc('day', p_now at time zone 'UTC'),
        interval '1 day'
      ) as day
  ),
  signups_by_day as (
    select
      signup_days.day,
      count(profile.id)::integer as signup_count
    from signup_days
    left join public.profiles as profile
      on profile.created_at >= signup_days.day at time zone 'UTC'
      and profile.created_at < (signup_days.day + interval '1 day') at time zone 'UTC'
    group by signup_days.day
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'pageViews', (select count(*)::integer from recent_visits),
      'uniqueSessions', (select count(distinct session_id)::integer from recent_visits),
      'activeSessions', (
        select count(*)::integer from session_stats
        where last_seen_at >= p_now - interval '2 minutes'
      )
    ),
    'signups', jsonb_build_object(
      'today', (
        select count(*)::integer from public.profiles
        where created_at >= date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC'
      ),
      'last7Days', (
        select count(*)::integer from public.profiles
        where created_at >= p_now - interval '7 days'
      ),
      'last30Days', (
        select count(*)::integer from public.profiles
        where created_at >= p_now - interval '30 days'
      ),
      'lastYear', (
        select count(*)::integer from public.profiles
        where created_at >= p_now - interval '1 year'
      )
    ),
    'signupsByDay', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', signup_count
      ) order by day)
      from signups_by_day
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode', country_code,
        'visits', visit_count
      ) order by visit_count desc, country_code)
      from (
        select country_code, count(*)::integer as visit_count
        from recent_visits
        where country_code is not null
        group by country_code
        order by visit_count desc, country_code
        limit 10
      ) as country_counts
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page', page_path,
        'visits', visit_count
      ) order by visit_count desc, page_path)
      from (
        select page_path, count(*)::integer as visit_count
        from recent_visits
        group by page_path
        order by visit_count desc, page_path
        limit 20
      ) as page_counts
    ), '[]'::jsonb),
    'visitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sessionId', session.session_id,
        'profileId', session.profile_id,
        'name', profile.full_name,
        'email', profile.email,
        'countryCode', session.country_code,
        'lastSeenAt', session.last_seen_at,
        'pageViews', session.page_views,
        'durationSeconds', session.duration_seconds,
        'pages', to_jsonb(session.pages)
      ) order by session.last_seen_at desc)
      from (
        select *
        from session_stats
        order by last_seen_at desc
        limit 100
      ) as session
      left join public.profiles as profile on profile.id = session.profile_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_website_analytics(timestamptz) from public, anon, authenticated;
grant execute on function public.get_admin_website_analytics(timestamptz) to service_role;
