-- HorizOn Discord self-registration migration.
-- Run this once in the Supabase SQL Editor for an existing project after
-- deploying the matching bot code. It is safe to run more than once.

create or replace function public.register_discord_member(
  p_member_id text,
  p_character_name text,
  p_class_name text,
  p_discord_user_id text,
  p_discord_username text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state jsonb;
  next_state jsonb;
begin
  if trim(p_member_id) = '' or trim(p_character_name) = '' or trim(p_class_name) = '' or trim(p_discord_user_id) = '' then
    raise exception 'Registration requires a character name, class, and Discord account.';
  end if;

  insert into public.guild_states (id, state)
  values (
    'horizon',
    '{"members":[],"parties":[],"reserveMemberIds":[],"auctionPages":[{"id":"auction-page-1","name":"Page 1","items":[{"id":"auction-page-1-item-1","name":"Item 1","bidderMemberIds":[]},{"id":"auction-page-1-item-2","name":"Item 2","bidderMemberIds":[]},{"id":"auction-page-1-item-3","name":"Item 3","bidderMemberIds":[]},{"id":"auction-page-1-item-4","name":"Item 4","bidderMemberIds":[]}]}]}'::jsonb
  )
  on conflict (id) do nothing;

  select state into current_state
  from public.guild_states
  where id = 'horizon'
  for update;

  if exists (
    select 1
    from public.discord_member_links
    where discord_user_id = trim(p_discord_user_id)
  ) then
    raise exception 'This Discord account is already registered. Ask a guild manager to change or remove the old character first.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(current_state->'members', '[]'::jsonb)) as existing(member)
    where lower(trim(existing.member->>'name')) = lower(trim(p_character_name))
  ) then
    raise exception 'A HorizOn character with this name already exists.';
  end if;

  next_state := jsonb_set(
    current_state,
    '{members}',
    coalesce(current_state->'members', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'id', trim(p_member_id),
        'name', trim(p_character_name),
        'className', trim(p_class_name)
      )
    ),
    true
  );

  update public.guild_states
  set state = next_state, updated_at = timezone('utc', now())
  where id = 'horizon';

  insert into public.discord_member_links (member_id, discord_user_id, discord_username, linked_at)
  values (trim(p_member_id), trim(p_discord_user_id), nullif(trim(p_discord_username), ''), timezone('utc', now()));

  insert into public.discord_voice_status (member_id, discord_username, is_in_main_voice, updated_at)
  values (trim(p_member_id), nullif(trim(p_discord_username), ''), false, timezone('utc', now()));

  return trim(p_member_id);
end;
$$;

revoke all on function public.register_discord_member(text, text, text, text, text) from public;
grant execute on function public.register_discord_member(text, text, text, text, text) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guild_states'
  ) then
    alter publication supabase_realtime add table public.guild_states;
  end if;
end $$;
