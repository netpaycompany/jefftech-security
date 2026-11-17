alter table public.profiles
  add column if not exists phone_number text
    check (char_length(phone_number) <= 32),
  add column if not exists address text
    check (char_length(address) <= 300),
  add column if not exists country text
    check (char_length(country) <= 100);

revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone_number, address, country) on public.profiles to authenticated;
