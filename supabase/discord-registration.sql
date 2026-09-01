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

-- `/unlink` removes the full character record, its party/reserve/auction references,
-- and its Discord link in the same transaction. Safe to run more than once.
create or replace function public.unlink_and_delete_discord_member(p_member_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state jsonb;
  next_state jsonb;
  member_id_to_remove text := trim(p_member_id);
  party_index integer;
  page_index integer;
  item_index integer;
begin
  if member_id_to_remove = '' then
    raise exception 'A member id is required.';
  end if;

  select state into current_state
  from public.guild_states
  where id = 'horizon'
  for update;

  if current_state is null then
    raise exception 'The HorizOn guild state does not exist.';
  end if;

  next_state := jsonb_set(
    current_state,
    '{members}',
    coalesce((
      select jsonb_agg(member)
      from jsonb_array_elements(coalesce(current_state->'members', '[]'::jsonb)) as entries(member)
      where entries.member->>'id' <> member_id_to_remove
    ), '[]'::jsonb),
    true
  );

  next_state := jsonb_set(
    next_state,
    '{reserveMemberIds}',
    coalesce((
      select jsonb_agg(member_id)
      from jsonb_array_elements(coalesce(next_state->'reserveMemberIds', '[]'::jsonb)) as entries(member_id)
      where entries.member_id #>> '{}' <> member_id_to_remove
    ), '[]'::jsonb),
    true
  );

  if jsonb_array_length(coalesce(next_state->'parties', '[]'::jsonb)) > 0 then
    for party_index in 0 .. jsonb_array_length(next_state->'parties') - 1 loop
      next_state := jsonb_set(
        next_state,
        array['parties', party_index::text, 'memberIds'],
        coalesce((
          select jsonb_agg(member_id)
          from jsonb_array_elements(coalesce(next_state #> array['parties', party_index::text, 'memberIds'], '[]'::jsonb)) as entries(member_id)
          where entries.member_id #>> '{}' <> member_id_to_remove
        ), '[]'::jsonb),
        true
      );
    end loop;
  end if;

  if jsonb_array_length(coalesce(next_state->'auctionPages', '[]'::jsonb)) > 0 then
    for page_index in 0 .. jsonb_array_length(next_state->'auctionPages') - 1 loop
      if jsonb_array_length(coalesce(next_state #> array['auctionPages', page_index::text, 'items'], '[]'::jsonb)) > 0 then
        for item_index in 0 .. jsonb_array_length(next_state #> array['auctionPages', page_index::text, 'items']) - 1 loop
          next_state := jsonb_set(
            next_state,
            array['auctionPages', page_index::text, 'items', item_index::text, 'bidderMemberIds'],
            coalesce((
              select jsonb_agg(member_id)
              from jsonb_array_elements(coalesce(next_state #> array['auctionPages', page_index::text, 'items', item_index::text, 'bidderMemberIds'], '[]'::jsonb)) as entries(member_id)
              where entries.member_id #>> '{}' <> member_id_to_remove
            ), '[]'::jsonb),
            true
          );
          next_state := jsonb_set(
            next_state,
            array['auctionPages', page_index::text, 'items', item_index::text, 'eliminatedBidderMemberIds'],
            coalesce((
              select jsonb_agg(member_id)
              from jsonb_array_elements(coalesce(next_state #> array['auctionPages', page_index::text, 'items', item_index::text, 'eliminatedBidderMemberIds'], '[]'::jsonb)) as entries(member_id)
              where entries.member_id #>> '{}' <> member_id_to_remove
            ), '[]'::jsonb),
            true
          );
          if next_state #>> array['auctionPages', page_index::text, 'items', item_index::text, 'winnerMemberId'] = member_id_to_remove then
            next_state := next_state #- array['auctionPages', page_index::text, 'items', item_index::text, 'winnerMemberId'];
          end if;
        end loop;
      end if;
    end loop;
  end if;

  update public.guild_states
  set state = next_state, updated_at = timezone('utc', now())
  where id = 'horizon';

  delete from public.discord_member_links
  where member_id = member_id_to_remove;
end;
$$;

revoke all on function public.unlink_and_delete_discord_member(text) from public;
-- The private guild dashboard has no login. It may request a deletion by member id,
-- while this function returns no Discord identity data and performs the full cleanup.
grant execute on function public.unlink_and_delete_discord_member(text) to anon, authenticated, service_role;

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
