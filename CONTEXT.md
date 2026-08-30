# Current Implementation Context

This document is the short working memory for the **HorizOn** Guild Party Manager. Read it before changing the app, and update it after every feature or fix.

## Current Product Decisions

- The app is a single-guild Next.js app with localStorage fallback and optional Supabase shared-database persistence. Supabase configuration is pending; never commit its credentials.
- Member cards show **name**, **class name**, and optional manual **CP** only. Tank/DPS/Healer/Support labels and role filters are intentionally removed.
- Each class has a dedicated original UI icon drawn from the Lucide icon set; these replace the previous generic sword icon.
- CP is display-only; there is no CP syncing or external API.
- Real guild members can be added with name, class, and optional CP. They persist with party state and begin Unassigned; Reset Party Setup must not remove them.
- Add Member uses a mobile-friendly dropdown of the 14 current Ragnarok: The New World job names: eight launch classes and six current advancements. Other/custom remains available for future classes.
- Roster import accepts a user-selected `.xlsx` or `.csv` file with Character Name/Name and Class/Job columns. It previews valid rows, appends only non-duplicate names, and persists through the same localStorage/Supabase guild state flow as manual member additions.
- Discord voice attendance is now approved. A separate server-side bot must link Discord users to characters and update only the configured main voice channel's presence; general Discord integration remains out of scope.
- The Unassigned pool is the derived list of every member not assigned to a party or Reserve. In voice, Away, and Not linked members all remain visible, with their Discord status shown on the card.
- The app starts with an empty roster. Guild members are added manually or imported from Excel/CSV; no mockup roster or Restore Demo Data action remains.
- No generated class PNG assets are currently integrated. Original transparent class-image generation is pending; use the current class-specific Lucide icons until that work resumes.

## Party Management Behavior

- A member is always in exactly one location: a party, Reserve, or derived Unassigned.
- Party capacity is 5. Full parties cannot receive another member.
- Desktop drag-and-drop and mobile tap-to-move use the same move logic.
- Dropping a member anywhere on a party card assigns them to that party.
- Dropping a member anywhere in the Unassigned panel returns them to Unassigned.
- Dragging a member onto another member in the same party swaps their positions.
- Mobile same-party reordering: tap member → **Reorder [Party]** → choose the teammate to swap with.

## Drag UI Decisions

- Drag preview is compact and centered under the pointer.
- The original card is hidden while dragging, not faded.
- No shadows or background wash should appear on dragged cards or active drop targets; only a thin border highlight is allowed.
- The full Unassigned member list is the drop target, not just individual cards.

## Layout Decisions

- Mobile is the primary layout; desktop adds drag-and-drop.
- The Unassigned list alone scrolls vertically when it is long. Do not add horizontal/side scrolling to the member panel or filter row.

## Required Validation

After a code change, run the relevant checks. The normal checks are:

```powershell
npm run lint
npm run build
```

`npm run test:state` exists for party-state logic, but this environment previously failed before test execution due a Node OS-level `uv_os_get_passwd` memory error.

## Latest Completed Change

- Added the **Add Member** sheet in the Member Pool. It requires name and class, accepts optional CP, and adds the member directly to Unassigned.
- Members now persist inside the existing localStorage state, including across refreshes. Corrupted or incomplete saved setups safely restore to an empty roster.
- Verified with lint, production build, browser add-member flow, and browser refresh persistence.

## Latest Completed Change

- Replaced the manual Discord On/Off control with real **main voice-channel attendance**. Cards now show **In voice**, **Away**, or **Not linked**, and each party shows its linked members currently in voice. The dashboard refreshes attendance every 15 seconds and has a manual refresh button.
- The earlier schema stored raw attendance in `discord_voice_presence` and exposed a safe `discord_voice_status` view. The Realtime migration below replaces that view with the current safe status table.
- Added `scripts/discord-bot.ts` and `npm run discord:bot`. The bot listens to Discord voice state events, synchronizes current attendance on startup, and registers leader-only `/link` and `/unlink` commands for character mapping.
- Added the official `discord.js` dependency. `npm run lint` and `npm run build` pass. `npm run test:state` remains blocked before test execution by the environment's Node `uv_os_get_passwd` ENOMEM error.
- Simplified the first-run RLS policy names and statements in `supabase/schema.sql` after the Supabase SQL Editor rejected an earlier pasted policy block. Re-copy the full current file before running it.

## Latest Completed Change

- Replaced the 15-second Discord attendance polling and manual refresh button with a Supabase Realtime subscription. Open dashboards now update automatically after the bot records a member joining or leaving the configured voice channel.
- `discord_voice_status` is now a protected, browser-readable table rather than a view, which allows safe Realtime subscriptions without exposing raw Discord user IDs. `supabase/enable-realtime.sql` migrates already-created projects and adds the table to the `supabase_realtime` publication.
- Updated the Discord bot to write safe status rows directly. Run the one-time migration in Supabase, then restart `npm run discord:bot`.
- Verified with `npm run lint` and `npm run build` (both pass). `npm run test:state` remains blocked before test execution by the environment's Node `uv_os_get_passwd` ENOMEM error.

## Latest Completed Change

- Refactored the Unassigned pool into a live main-voice queue. It now shows only members who are both Unassigned and currently in the configured Discord voice channel; away and unlinked members remain in the roster and their state is unchanged.
- Added `getUnassignedInMainVoiceMembers` as a pure derived-state helper and a state test covering the live queue filter.
- Verified with `npm run lint`, `npm run test:state` (5 passing tests), and `npm run build`.

## Latest Completed Change

- An earlier dropdown briefly used 39 classic Ragnarok Online jobs. It has been superseded by the Ragnarok: The New World list below.
- Verified with `npm run lint`, `npm run test:state` (6 passing tests), and `npm run build`.

## Latest Completed Change

- Corrected the Add Member dropdown to **Ragnarok: The New World**: its eight launch classes (Swordsman, Mage, Archer, Acolyte, Thief, Merchant, Gunslinger, Druid) and six current advancements (Knight, Wizard, Hunter, Priest, Assassin, Blacksmith).
- The dropdown now shows 14 current job names, grouped by launch class and advancement, plus Other/custom for future additions.
- Verified with `npm run lint`, `npm run test:state` (6 passing tests), and `npm run build`.

## Latest Completed Change

- Added a mobile-friendly **Import members** sheet. It reads user-selected `.xlsx` or `.csv` files with Character Name/Name and Class/Job headers, previews valid rows, and skips duplicate or incomplete rows before confirmation.
- Confirmed imports append new members to the existing guild state and therefore use the normal localStorage and Supabase shared-roster save path. No new database table or manual SQL is needed.
- Replaced an initially considered Excel reader because its dependency audit reported an unresolved high-severity advisory. The final `read-excel-file` dependency has zero production audit findings; legacy `.xls` is intentionally unsupported.
- Verified with `npm run lint`, `npm run build`, and `npm audit --omit=dev` (zero vulnerabilities). `npm run test:state` is currently blocked before test execution by the environment's Node `uv_os_get_passwd` ENOMEM error.

## Latest Completed Change

- Fixed the dnd-kit hydration warning shown on initial page load. The party manager now uses the stable `horizon-party-manager-dnd` DndContext ID, so server and browser render the same drag accessibility IDs.

## Latest Completed Change

- Added server-only bulk Discord linking from the roster `.xlsx` or `.csv` file. Add an optional **Discord User ID** column, import the roster through the website, then run `npm run discord:import-links -- "<roster file>"`.
- The command requires 17–20 digit Discord IDs stored as Excel text, verifies every account belongs to the configured Discord server, maps exact character names to the shared roster, replaces prior links for the imported entries, and records the current main-voice status immediately.
- The browser never reads or writes Discord IDs; it safely ignores the optional import column. The member template now includes the text-formatted Discord User ID column and instructions.
- Verified with `npm run lint`, `npm run test:state` (8 passing tests), `npm run build`, plus visual verification of both sheets in the updated `.xlsx` template.

## Latest Completed Change

- Added live whole-guild attendance totals beside Create Party: **In voice** (currently in the configured main voice channel), **Away** (linked but outside that channel), and **Not linked**. Away is deliberately not presented as general Discord offline status.
- Party cards now use a responsive wrapping grid when many parties exist. Party names can wrap within their header, and header actions no longer squeeze or clip titles; the workspace prevents horizontal page overflow.
- Old Excel/CSV roster files with only Character Name and Class/Job stay compatible. They import normally and the new members remain Not linked until linked with `/link` or the bulk Discord import command.
- Verified with `npm run lint`, `npm run test:state` (8 passing tests), and `npm run build`.

## Latest Completed Change

- Applied the selected full-name party layout: party members are now full-width rows, character names may wrap to two lines, and voice badges sit alongside each row rather than overlaying its text. This favors readable lineups over the previous two-column member tile density.
- Verified with `npm run lint`, `npm run test:state` (8 passing tests), and `npm run build`.

## Latest Completed Change

- Replaced the text voice badges on member cards with one small static headset icon immediately beside the character name. Its color distinguishes In voice, Away, and Not linked, while the native tooltip retains the exact status and Discord name when available.
- Removed the badge background, border, glow, and animation/transition treatment so the In voice indicator is not visually flashing or pulsing.
- Verified with `npm run lint`, `npm run test:state` (8 passing tests), and `npm run build`.

## Latest Completed Change

- Added a small solid green dot on the headset icon when a member is currently in the configured main Discord voice channel. The dot is static with no glow, pulse, or blinking; Away and Not linked icons do not show it.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Fixed the green voice-dot layout regression: legacy absolute badge offsets were still applied when the active headset became relatively positioned, making the dot float above the name. The active icon now clears those offsets so its solid dot stays attached beside the headset.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Moved the static headset and its green In voice dot to the far right inside every member card. It now stays in the normal card layout, leaving the character name and class unobstructed on the left.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Restored the readable voice-state badges on member cards: **In voice** (green), **Away** (gold), and **Not linked** (gray), each with a headset icon. The badge remains at the far right inside the card, so it cannot overlap the name or class.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Removed the mockup roster and the Restore Demo Data action. New installations now begin with an empty roster for manual entry or Excel/CSV import; existing saved real rosters are not erased.
- Fixed the desktop layout when many parties exist: the Unassigned column now stretches alongside the complete party list instead of ending after one viewport.
- Added Vercel deployment guidance, including the separation between the Vercel website and the always-running Discord bot.
- Verified with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Changed Unassigned to show every member who is not in a party or Reserve. Discord attendance no longer hides Away or Not linked members; the card badge communicates their status instead.
- Added [`supabase/clear-guild-data.sql`](supabase/clear-guild-data.sql), a manual, destructive Supabase reset for the complete shared guild state and Discord attendance data. It includes a warning to stop the bot and close stale browser tabs first.
- Verified the Unassigned-state behavior with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.
