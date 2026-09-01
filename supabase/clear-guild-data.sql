-- DESTRUCTIVE: permanently clears the shared HorizOn roster and setup.
-- Before running: stop `npm run discord:bot` and close/reload all open app tabs.
-- This deletes all members, parties, Reserve assignments, Auction pages/bids,
-- Discord character links, and stored voice statuses for this Supabase project.
-- It does not delete your Supabase project, Discord bot, or environment variables.

begin;

delete from public.discord_voice_status;
delete from public.discord_member_links;
delete from public.guild_states where id = 'horizon';

commit;

-- On the next website load, HorizOn creates a new empty `horizon` guild state.
