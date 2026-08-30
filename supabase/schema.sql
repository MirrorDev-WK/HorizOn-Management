-- HorizOn Supabase schema. Run this once in the Supabase SQL Editor before
-- starting the Discord bot. The website uses the publishable key; the bot alone
-- uses SUPABASE_SERVICE_ROLE_KEY to link Discord users and update voice status.

create table if not exists public.guild_states (
  id text primary key check (id = 'horizon'),
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.discord_member_links (
  member_id text primary key,
  discord_user_id text not null unique,
  discord_username text,
  linked_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.discord_voice_status (
  member_id text primary key references public.discord_member_links(member_id) on delete cascade,
  discord_username text,
  is_in_main_voice boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.guild_states enable row level security;
alter table public.discord_member_links enable row level security;
alter table public.discord_voice_status enable row level security;

-- The current party manager has no user login, so its shared state remains
-- editable by anyone who can open the configured app. Keep the app private.
grant select, insert, update on table public.guild_states to anon, authenticated;
drop policy if exists horizon_read_state on public.guild_states;
create policy horizon_read_state on public.guild_states
for select to anon, authenticated using (id = 'horizon');
drop policy if exists horizon_create_state on public.guild_states;
create policy horizon_create_state on public.guild_states
for insert to anon, authenticated with check (id = 'horizon');
drop policy if exists horizon_update_state on public.guild_states;
create policy horizon_update_state on public.guild_states
for update to anon, authenticated using (id = 'horizon') with check (id = 'horizon');

-- The browser can read only the safe status table: no raw Discord IDs and no writes.
-- The service-role bot bypasses RLS and is the only process that writes tables.
revoke all on table public.discord_member_links from anon, authenticated;
revoke all on table public.discord_voice_status from anon, authenticated;
grant select on table public.discord_voice_status to anon, authenticated;
grant all on table public.discord_member_links to service_role;
grant all on table public.discord_voice_status to service_role;
drop policy if exists discord_voice_status_read on public.discord_voice_status;
create policy discord_voice_status_read on public.discord_voice_status
for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discord_voice_status'
  ) then
    alter publication supabase_realtime add table public.discord_voice_status;
  end if;
end $$;
