alter table public.profiles
  add column if not exists referral_code text
    check (
      char_length(referral_code) <= 64
      and referral_code ~ '^[A-Z0-9_-]+$'
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
