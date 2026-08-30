-- DANGER: This permanently removes every shared HorizOn roster member,
-- party, reserve assignment, Discord character link, and voice status.
--
-- Run this manually in Supabase SQL Editor only when you want to begin again.
-- First stop the Discord bot and close any browser tab that still has an old
-- local roster, otherwise that stale browser can save its data back to Supabase.

begin;

-- The website's complete shared roster, parties, and reserve state.
delete from public.guild_states where id = 'horizon';

-- Deleting links cascades to the current discord_voice_status table.
delete from public.discord_member_links;

-- Remove legacy attendance data too, if an older schema created this table.
do $$
begin
  if to_regclass('public.discord_voice_presence') is not null then
    execute 'delete from public.discord_voice_presence';
  end if;
end $$;

commit;
