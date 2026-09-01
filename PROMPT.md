# HorizOn Guild Party Manager — Implementation Specification

You are a senior frontend engineer building an internal web application for one Ragnarok guild named **HorizOn**.

Read `AGENTS.md`, `README.md`, and `DESIGN_RULES.md` before implementing or changing the product.

## Objective

Build the fastest usable MVP for Guild League party management.

The leader must be able to:

1. Add and see guild members.
2. Create multiple parties.
3. Assign members to parties.
4. Move members between parties.
5. Remove members back to Unassigned.
6. Put members in Reserve.
7. See everyone still Unassigned.
8. Never assign one member to multiple locations.
9. Refresh without losing the current setup.
10. Use the app comfortably from a phone.

## Required Stack

- Next.js
- TypeScript
- Tailwind CSS
- dnd-kit
- localStorage

Use Supabase for shared state and the approved Discord voice-attendance tables.
Implement only the Discord bot needed for linked member voice-channel checks and
the approved self-registration flow: class-text button, character-name form,
automatic roster creation, and Discord link. Do not introduce authentication,
general Discord features, Redux, or enterprise architecture.

## Member Model

```ts
export type GuildMember = {
  id: string;
  name: string;
  className: string;
  avatar?: string;
  cp?: number;
  isDiscordLinked?: boolean;
  discordUsername?: string;
  isInMainVoice?: boolean;
};
```

CP is display-only manual data. A separate server-side bot links Discord users
to characters and tracks only their presence in the configured main voice channel.
In Discord, a manager can post the registration panel; members choose a text
class badge and enter a character name. The bot creates exactly one linked
character for that Discord account and adds it to the shared roster.
A manager's `/unlink` command permanently removes that selected character from
the shared roster and its Discord link, including any party, Reserve, and
auction references, so duplicate characters are not left behind.
The browser must subscribe to the safe voice-status table with Supabase Realtime,
and to the shared guild-state table, so roster and attendance changes appear in
open dashboards without a refresh.

Show guild attendance totals in the party header: **In voice** (currently in the
configured main voice channel), **Away** (linked but outside that channel), and
**Not linked**. Do not describe Away as general Discord offline status.

## Party Model

```ts
export type Party = {
  id: string;
  name: string;
  memberIds: string[];
};
```

Do not hardcode exactly four parties.

Users can:

- Add a party
- Rename a party
- Delete a party

Deleting a non-empty party requires confirmation. Its members return to Unassigned.

## Party Capacity

```ts
const DEFAULT_PARTY_CAPACITY = 5;
```

Display `current / capacity`.

Prevent assigning a sixth member and show a small non-blocking message.

## Assignment Rules

Supported movements:

```text
Unassigned -> Party
Party -> Party
Party -> Reserve
Reserve -> Party
Party -> Unassigned
Reserve -> Unassigned
```

A member can exist in exactly one location.

Prefer deriving Unassigned from all members minus party/reserve assignments rather than maintaining duplicate state.

## Mobile-First Requirement

Minimum target viewport: 360px.

Do not simply shrink the desktop UI.

Primary mobile flow:

```text
Tap Member
    ↓
Bottom Sheet / Modal
    ↓
Move to:
- Party 1
- Party 2
- Party 3
- ...
- Reserve
- Unassigned
```

Full parties must be disabled as destinations.

Touch targets should be approximately 44px or larger. Do not depend on hover.

Recommended mobile layout:

```text
Header
Party selector/tabs
Selected Party
Reserve
Unassigned Members
```

## Desktop

Desktop additionally supports drag and drop with dnd-kit.

Recommended layout:

```text
Sidebar | Members | Party Workspace
```

Dragging should clearly show the active card and valid drop targets.

## Member Pool

Show only Unassigned members who are currently in the configured main Discord
voice channel. Keep every other member in the roster and preserve their party,
reserve, and Unassigned state; this is a display filter, not a deletion rule.

Provide an **Add Member** action with required character name, a **Ragnarok: The
New World** job dropdown, and optional manual CP. Include its eight launch
classes (Swordsman, Mage, Archer, Acolyte, Thief, Merchant, Gunslinger, and
Druid) plus the twelve advanced classes (Lord Knight, Paladin, Sniper, Bard,
Dancer, High Wizard, Sage, High Priest, Champion, Assassin Cross, Whitesmith,
and Night Walker). Retain an **Other / custom class** choice for
future server-specific jobs. New members begin Unassigned and Not linked.
Without Supabase, persist state locally. When Supabase is configured, load and
save the shared guild state there as the source of truth; do not restore or
re-upload a stale local browser roster.

Add an **Auction** navigation section for Guild League items. An auction page
has exactly four item rows. Each row has an editable item name and a bidder list
made from the existing guild-member roster. Each row must provide a name/class
search that adds a matching roster member as bidder. A member may be recorded as a bidder
on more than one item. When an item has two or more bidders, provide a visible
elimination wheel. Each spin removes the selected bidder, then the next spin
uses only the remaining members; the final person left is saved as winner.
Use Spin to remove to open the draw popup first; the coordinator starts the
actual draw with a Spin the wheel action inside that popup. Keep it open
between eliminations with a Spin again action, and provide an explicit × close
button that cancels the current draw.
Changing bidders resets the draw. Do not add bid prices, payments, or external
auction integration.
Provide a confirmed Clear auction action that resets the full Auction board to
one empty default Page 1, removing all other pages, item names, bidders, and winners.
Provide a confirmed Delete page action while keeping at least one Auction page.
The winner wheel should open as a large, exciting pop-up draw rather than spin
only inside the item row. Give each bidder a visible colored wheel slice with
their name, and make the pointer stop on the selected eliminated member's slice.
Land the pointer at a random safe point inside that slice rather than always at
the slice center.
The wheel must be large enough to read full names, have a slower physical-style
deceleration, and show only the final winner instead of repeating every name
below the wheel.

Provide an **Import members** action for `.xlsx` and `.csv` roster
files. Require Character Name/Name and Class/Job columns, preview the valid
rows before confirmation, and append only non-duplicate character names. An
optional Discord User ID column is allowed but must never be saved or used by
the browser; a separate server-only bot command imports those links after the
roster is saved. Import must use the existing state save flow rather than adding
a separate data path. Older files with only the required Character Name and
Class columns must continue to work and create Not linked members.

Each compact card contains:

```text
[Illustrated Class Emblem] Character Name
             Class Name
             CP
```

Use clear, original code-native class symbols for the supported 20 Ragnarok: The
New World classes. Symbols must be immediately readable at card size and must
not copy official game icons. Retain a simple fallback symbol for an Other/custom
class. Use restrained class-family colors: martial red, magic blue, holy gold,
ranged/nature green, craft orange, shadow purple, and performance pink.

The member move sheet must include a confirmed **Delete member** action.
Deleting removes all roster, party, Reserve, auction, and Discord-link
references in one shared-database transaction. The browser must never read or
display a Discord User ID.

Support search by character name and class.

When the list is long, make the Unassigned member area scrollable. Clearly say
when there are no unassigned members or no search matches.

## Party Cards

Party cards are more visual than member-list cards.

Within a party card, use one full-width row per member. Character names must be
able to wrap to two lines rather than truncate, and the voice badge must stay in
normal layout flow at the far end of the row instead of covering the name. Display
the voice state as a compact static badge with a headset icon and **In voice**,
**Away**, or **Not linked** label. Use a tooltip for accessibility; do not use
flashing or glowing indicators.

Show:

- Party name
- Member count
- Character/avatar or class placeholder
- Character name
- Class
- CP, when available
- Empty slots

Never show broken images.

## Reserve

Reserve is a special drop/assignment destination with no strict capacity.

## Persistence

Use:

```text
horizon-party-manager-v1
```

Centralize persistence in:

```text
src/lib/storage.ts
```

Do not scatter direct localStorage calls throughout components. When Supabase is
configured, keep remote state handling in `src/lib/supabase.ts`. Use only its
publishable browser key in the website; the separate bot process uses a server-only
service-role key for Discord links and attendance updates.

Gracefully handle corrupted/missing data and start with an empty roster on a new installation.

## Reset

Provide `Reset Party Setup`.

It clears assignments but does not delete guild members.

Provide a separate, manually run Supabase SQL reset script for an administrator
who explicitly wants to erase the shared roster, parties, Reserve assignments,
Discord links, and stored voice attendance. Never expose this destructive reset
as an ordinary website action.

## Suggested Structure

```text
src/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/
│   ├── members/
│   ├── party/
│   └── ui/
├── features/
│   └── party-manager/
│       ├── types.ts
│       ├── constants.ts
│       ├── utils.ts
│       └── hooks.ts
├── lib/
│   └── storage.ts
```

Keep the structure simple. This is guidance, not a reason to over-abstract.

## Implementation Order

### Phase 1
- App shell
- HorizOn dark-green theme
- Empty first-run roster state
- Party cards
- Derived Unassigned list
- Mobile layout

### Phase 2
- Mobile tap-to-assign
- Desktop drag and drop
- Party capacity
- Party-to-party movement
- Reserve

### Phase 3
- localStorage
- Search/filter
- Add/delete/rename party
- Reset

### Phase 4
- Responsive polish
- Empty/error states
- Animation and visual polish

Do not start future features before Phases 1–3 work correctly.

## Definition of Done

The MVP is done when:

- App runs/builds without obvious errors.
- New installations start with an empty roster ready for member import or manual entry.
- Parties can be created and managed.
- Members can be assigned/moved/removed.
- Reserve works.
- Duplicate assignments are impossible.
- Capacity is enforced.
- Unassigned is always correct.
- Refresh preserves state.
- Mobile works from 360px.
- Mobile does not require drag and drop.
- Desktop drag and drop works.
- HorizOn dark-green branding is applied.
- No obvious TypeScript or console errors exist.

When choosing between complexity and simplicity, choose simplicity.

Priority:

**usable first -> correct second -> beautiful third -> extensible fourth**
