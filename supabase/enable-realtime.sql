-- Run this once in the Supabase SQL Editor if you already ran an earlier
-- version of schema.sql. It replaces the old read-only view with a safe table
-- that the browser can subscribe to. Raw Discord IDs remain bot-only.

do $$
begin
  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'discord_voice_status'
      and relation.relkind = 'v'
  ) then
    execute 'drop view public.discord_voice_status';
  end if;
end $$;

create table if not exists public.discord_voice_status (
  member_id text primary key references public.discord_member_links(member_id) on delete cascade,
  discord_username text,
  is_in_main_voice boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.discord_voice_status (member_id, discord_username, is_in_main_voice, updated_at)
select
  links.member_id,
  links.discord_username,
  coalesce(presence.is_in_main_voice, false),
  coalesce(presence.updated_at, timezone('utc', now()))
from public.discord_member_links as links
left join public.discord_voice_presence as presence using (discord_user_id)
on conflict (member_id) do update
set
  discord_username = excluded.discord_username,
  is_in_main_voice = excluded.is_in_main_voice,
  updated_at = excluded.updated_at;

alter table public.discord_voice_status enable row level security;
revoke all on table public.discord_voice_status from anon, authenticated;
grant select on table public.discord_voice_status to anon, authenticated;
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
