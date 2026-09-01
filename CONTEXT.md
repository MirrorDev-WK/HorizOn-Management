# Current Implementation Context

This document is the short working memory for the **HorizOn** Guild Party Manager. Read it before changing the app, and update it after every feature or fix.

## Current Product Decisions

- The app is a single-guild Next.js app. Without Supabase it uses localStorage; once Supabase is configured, Supabase is the sole shared roster and party-state source of truth. Never commit its credentials.
- Member cards show **name**, **class name**, and optional manual **CP** only. Tank/DPS/Healer/Support labels and role filters are intentionally removed.
- Supported classes use dedicated, simple code-native UI symbols; a general fallback icon remains for custom classes.
- CP is display-only; there is no CP syncing or external API.
- Real guild members can be added with name, class, and optional CP. They persist with party state and begin Unassigned; Reset Party Setup must not remove them.
- Add Member uses a mobile-friendly dropdown of 20 Ragnarok: The New World job names: eight launch classes and twelve advanced classes. Other/custom remains available for future classes.
- Roster import accepts a user-selected `.xlsx` or `.csv` file with Character Name/Name and Class/Job columns. It previews valid rows, appends only non-duplicate names, and persists through the same configured source as manual member additions (Supabase when configured).
- Discord voice attendance and text-button self-registration are approved. A separate server-side bot may create one roster character and Discord link after a member selects a class and enters their in-game name, and it updates only the configured main voice channel's presence; general Discord integration remains out of scope.
- The Unassigned pool is the derived list of every member not assigned to a party or Reserve. In voice, Away, and Not linked members all remain visible, with their Discord status shown on the card.
- The app starts with an empty roster. Guild members are added manually or imported from Excel/CSV; no mockup roster or Restore Demo Data action remains.
- Auction is a shared Guild League board stored in the same Supabase guild state. Every auction page has four item rows, and each row records roster members who want to bid. When a row has two or more bidders, an elimination wheel removes one selected member per spin; the final member left is saved as winner. Changing bidders resets that draw. Bid price and payment logic are out of scope.
- Auction rows use a compact, code-native management layout: item number, editable item name, bidder count, labelled roster search, removable bidder chips, and a draw action only when needed. No generated or AI artwork is used.
- Clear auction is confirmed before it resets the entire board to one empty default Page 1, removing all other pages, item names, bidder lists, and winners.
- An Auction page may be deleted only when at least one other page remains. Elimination spins use a large, focused pop-up draw with one colored, named slice per remaining bidder; the pointer visually stops on the removed bidder's slice.
- Wheel slice colors are generated per bidder instead of using a fixed short palette, so larger draws retain visually distinct slices.
- The draw now prioritizes suspense and readable names: a larger wheel runs for about five seconds with staged deceleration, displays full member names on slices, hides the redundant contender list, and reveals only the final winner.
- The elimination modal remains open after an Out result; the coordinator clicks Spin again inside that same modal until the final winner is revealed.
- The 20 supported class choices use simple, immediately recognizable code-native symbols. Custom classes retain a Lucide fallback.

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

- Corrected the Add Member dropdown to **Ragnarok: The New World**: its eight launch classes (Swordsman, Mage, Archer, Acolyte, Thief, Merchant, Gunslinger, Druid) and twelve advanced classes (Lord Knight, Paladin, Sniper, Bard, Dancer, High Wizard, Sage, High Priest, Champion, Assassin Cross, Whitesmith, Night Walker).
- The dropdown now shows 20 job names, grouped by launch class and advanced class, plus Other/custom for future additions.
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

- Reduced the decorative center hub of the Auction wheel so the center no longer covers bidder labels on narrow slices.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Changed Auction draw control flow: **Spin to remove** opens the large wheel popup without starting the draw, and **Spin the wheel** inside the popup begins it. The popup now has an explicit × close button that cancels the current draw.
- Verified with `npm run lint` and `npm run build`.

## Latest Completed Change

- Updated the Auction elimination wheel so its selected Out bidder stops at a varied safe point inside that bidder's slice, rather than exactly in the center below the pointer.
- The final round now explicitly shows both outcomes: the bidder under the pointer is Out, and the last remaining bidder wins the item.
- Verified with `npm run test:state` (11 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added a confirmed **Clear auction** action. It retains Auction pages but resets their four item rows to empty defaults, clearing bids and winners in the shared state.

## Latest Completed Change

- Added a confirmed **Delete page** action for Auction. It is disabled when only one page remains, so the Auction view always has a usable page.
- Reworked the random winner draw into a full-screen modal with a large spinning wheel, pointer, contender names, and a saved winner reveal.
- Verified with `npm run test:state` (10 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Refined the winner draw to a true roulette wheel: each bidder has a separate colored, named slice, and the calculated spin ends with the pointer on the saved winner's slice.
- Verified with `npm run test:state` (10 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Replaced the fixed eight-color wheel palette with generated per-bidder colors, so larger draws do not reuse the first few slice colors.
- Verified with `npm run test:state` (10 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Enlarged the Auction draw wheel, removed the redundant contender list, and shows the final winner only after the draw completes.
- The wheel now makes 8–10 full turns over about five seconds using staged deceleration, while still ending exactly on the chosen winner's slice. Full member names are compressed to fit their slices rather than truncated.
- Verified with `npm run test:state` (10 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Reviewed the Wheel of Names reference and changed the draw to one continuous 7-second ease-out spin, rather than several staged speed changes. The draw now makes 10–13 full rotations and the wheel is wider on desktop, while preserving the exact landing slice.
- Verified with `npm run test:state` (10 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Changed Auction selection to an elimination draw. Every spin removes the named slice under the pointer, marks that bidder Out, and excludes them from the next spin; the final remaining bidder is saved as the winner.
- Adding or removing a bidder resets the elimination draw. Existing direct-winner results reset safely under the new rule.
- Verified with `npm run test:state` (11 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Replaced the wheel's CSS keyframe animation with a direct SVG browser animation. Its rotation origin is locked to the wheel center, while the pointer stays fixed, for a smooth continuous spin and exact final slice alignment.
- Each spin now lands at a random safe point inside the eliminated bidder's slice instead of its exact center. The final result explicitly names the Out bidder under the pointer and the last remaining winner.
- Verified with `npm run test:state` (11 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Changed Unassigned to show every member who is not in a party or Reserve. Discord attendance no longer hides Away or Not linked members; the card badge communicates their status instead.
- Added [`supabase/clear-guild-data.sql`](supabase/clear-guild-data.sql), a manual, destructive Supabase reset for the complete shared guild state and Discord attendance data. It includes a warning to stop the bot and close stale browser tabs first.
- Verified the Unassigned-state behavior with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Made configured Supabase projects remote-first: the website loads the roster and party state exclusively from Supabase and saves changes there. It no longer restores or re-uploads an old browser localStorage roster when Supabase is configured.
- localStorage remains available only when no Supabase configuration is present. A new configured Supabase project begins with an empty shared state.
- Verified with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added the **Auction** navigation view for Guild League. Auction pages are stored in the shared guild state; every page has exactly four item rows, each with an item name and a roster-member bidder list.
- Members may bid on multiple items. When two or more members bid on one item, the coordinator can spin the random winner wheel; its saved result resets if the bidder list changes. Bid prices and payment logic remain intentionally out of scope.
- Added page tabs and a New page action, plus mobile navigation between Party and Auction.
- Verified with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added a gold random winner wheel to each Auction item with two or more bidders. Spinning chooses one current bidder and saves the winner to the shared guild state.
- Adding or removing any bidder clears the saved winner, so the result always matches the current bidder list.
- Verified with `npm run test:state` (8 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Clear auction now replaces every Auction page with one clean default **Page 1** containing four empty items. It no longer preserves the previous page tabs.
- The Auction view automatically selects the replacement Page 1 after the reset.
- Verified with `npm run test:state`, `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added Discord self-registration: a server manager runs `/setup-registration`, members select a text class button, then enter their in-game character name in a Discord modal. The bot creates the roster member, Discord link, and initial safe Away status in one server-only Supabase operation.
- Added [`supabase/discord-registration.sql`](supabase/discord-registration.sql) for existing projects. It also enables Realtime events for shared guild-state updates, so open dashboards receive newly registered members without a refresh.
- The existing `/link` manager tool remains available for manual corrections. `/unlink` deletes the selected character from the shared roster and removes its Discord link, party/reserve references, and auction references in one server-side transaction.
- Verified with `npx tsc --noEmit`, `npm run test:state`, `npm run lint`, and `npm run build`.

## Latest Completed Change

- Replaced the generic line class icons on member cards with class-specific symbols. Unsupported custom classes keep the Lucide fallback.
- The generated image sheets were removed from the project; the live UI deliberately uses the clearer code-native symbols instead.
- Visually verified the card crops in the local application. Verified with `npx tsc --noEmit`, `npm run test:state`, `npm run lint`, and `npm run build`.

## Latest Completed Change

- Expanded the shared class list to 20 choices: the eight launch classes plus Lord Knight, Paladin, Sniper, Bard, Dancer, High Wizard, Sage, High Priest, Champion, Assassin Cross, Whitesmith, and Night Walker.
- The web dropdown and Discord registration panel now derive from this same 20-class list.
- Existing saved legacy names such as Hunter and Priest stay valid and display a related advanced emblem; the database schema does not need to change.

## Latest Completed Change

- Changed the manager-only Discord `/unlink` command into a deliberate full removal: it deletes the selected character from the shared roster and removes its Discord link, party/Reserve assignments, and auction references together. This prevents an unlinked duplicate card from remaining in the app.
- Added `unlink_and_delete_discord_member` to [`supabase/schema.sql`](supabase/schema.sql) and the existing-project migration [`supabase/discord-registration.sql`](supabase/discord-registration.sql).

## Latest Completed Change

- Replaced the detailed generated class-emblem crops in live member cards with clear code-native symbols. Each supported class now maps to a readable role cue at small sizes, such as shield, sword, wand, crosshair, music note, cross, hammer, or moon.
- This is original interface artwork and does not copy Ragnarok World icons; the generated emblem sheets were removed from the project.
- Visually verified the member-card symbols in the local application. Verified with `npx tsc --noEmit`, `npm run test:state`, `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added restrained class-family color cues to the simple symbols: martial red, magic blue, holy gold, ranged/nature green, craft orange, shadow purple, and performance pink. Color applies only to the icon tile, keeping names and class text easy to read.
- Verified with `npx tsc --noEmit`, `npm run test:state`, `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added a confirmed **Delete member** button to the member move sheet. It removes the character from the shared roster/local state and all party, Reserve, Auction, and Discord-link references.
- For a Supabase-backed roster, the dashboard invokes the same transaction as Discord `/unlink`; it returns no Discord identity data to the browser.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Expanded the dashboard **Delete member** action to delete linked members as well. The browser calls `unlink_and_delete_discord_member` by member id; the database removes the private link and cascades voice-status cleanup without exposing Discord User IDs.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Updated [`supabase/enable-realtime.sql`](supabase/enable-realtime.sql) to add both `guild_states` (roster, parties, Reserve, Auction) and `discord_voice_status` to the Supabase Realtime publication for existing projects. Run it once in the SQL Editor, then open dashboards receive changes without a page refresh.

## Latest Completed Change

- Replaced each Auction item's long bidder dropdown with a searchable guild-roster picker. Search matches character name or class, excludes existing bidders, and shows up to six quick-add results.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Refined Auction into a minimal code-only interface. The four stored item rows are more compact and show the item number, item name, bidder total, labelled Add bidder search, bidder chips, and the existing wheel action only when it applies.
- The change is visual only; Auction pages, bidder records, elimination rounds, and saved winners keep their existing behavior.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Added a chevron dropdown to every Auction Add bidder search. Clicking it opens all eligible guild members; typing filters that same list by name or class.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Reduced and fitted Auction wheel labels per slice and per character-name length. Short names keep their natural width; long names compress only as needed, so labels stay inside the wheel instead of dominating it.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Auction’s bidder dropdown now closes when the coordinator clicks outside its search and results area.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.

## Latest Completed Change

- Fixed desktop Unassigned roster overflow. The left roster remains within the viewport and its member list scrolls independently when there are many members.
- Verified with `npx tsc --noEmit`, `npm run test:state` (12 passing tests), `npm run lint`, and `npm run build`.
