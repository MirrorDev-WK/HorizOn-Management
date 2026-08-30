# HorizOn Guild Party Manager — Design Rules

## Brand

Always write the guild name exactly as:

**HorizOn**

The interface should feel like a dedicated fantasy RPG guild tool, not a corporate SaaS/admin dashboard.

## Visual Direction

Theme: **Dark Green Fantasy**

Use:
- deep forest/black-green backgrounds
- emerald surfaces and accents
- restrained lime highlights
- small gold accents
- original fantasy/class imagery
- modern readable UI typography

Do not copy official Ragnarok/ROW artwork, logos, UI, portraits, or class icons.

## Color Tokens

Suggested starting palette:

```css
--background: #04110B;
--sidebar: #03100A;
--surface: #071A10;
--surface-elevated: #0B2115;

--green-primary: #3A8F28;
--green-bright: #8EDB3F;
--emerald: #2FAE62;
--border-green: #284D2C;

--gold: #D6B455;

--text-primary: #F4F7F2;
--text-secondary: #AAB8AA;
--text-muted: #718174;

--danger: #E34C43;
--warning: #E6A323;
--info: #3B82F6;
```

Dark green dominates. Bright green is an accent, not the background of everything.

## Mobile First

Design from 360px upward.

Do not shrink the desktop dashboard into a tiny three-column layout.

Mobile hierarchy:

```text
Header
Party selector
Selected Party
Reserve
Unassigned
```

Primary mobile interaction is tap-to-assign/move using a bottom sheet or modal.

No feature may require hover.

Touch targets should be approximately 44px minimum.

Avoid horizontal page scrolling.

When the Unassigned list is long, keep it in a touch-scrollable area rather than letting it overwhelm the party workspace.

## Desktop Layout

Target:

```text
Sidebar 220–260px
Member Pool 280–340px
Party Workspace remaining width
```

The Party Workspace is the primary visual area.

## Sidebar

Top identity:

```text
[Original Guild Emblem]
HorizOn
Guild
```

MVP navigation only:

- Party Setup
- Members (only if implemented)

Do not display fake future navigation.

Active item uses a subtle emerald surface plus lime/green accent.

## Party Card

Example:

```text
┌─────────────────────────────────────┐
│ ⚔ Party 1                    4 / 5  │
│                                     │
│ [member][member][member][member][+] │
└─────────────────────────────────────┘
```

Use subtle green borders and elevated dark surfaces.

Full parties should be visibly full without becoming visually noisy.

## Party Member Card

Visual priority:

1. Character/avatar/class visual
2. Character name
3. Class
4. CP

Example:

```text
┌───────────────┐
│               │
│   Portrait    │
│               │
│     Bek       │
│   Paladin     │
│   CP 148,200  │
└───────────────┘
```

Display CP as a small muted/gold detail beneath the class when it is available. CP is informational only; do not add CP syncing.

Within desktop party cards, arrange members as full-width rows rather than a
two-column tile grid. Allow character names to wrap to two lines; keep the
voice icon at the far end of the member row in normal layout flow so it never
covers a name.

## Member List Card

Keep member-pool cards compact:

```text
┌─────────────────────────────┐
│ [icon] Bek                  │
│        Paladin  ·  CP 148k  │
└─────────────────────────────┘
```

They should be denser than party cards.

## Discord Voice Attendance

Show a compact, non-editable static badge at the far end of every member card:
headset plus **In voice** in emerald/lime, **Away** in muted gold for linked
members outside the main channel, and **Not linked** in muted gray. Use its
native tooltip for accessibility; do not use flashing or glowing indicators.
The party header must show an In Voice count.
Show the same three totals for the whole guild beside the main party actions;
Away means outside the configured main voice channel, not necessarily offline
on Discord. The dashboard updates the status live without a page refresh, but only the
server-side bot may change it.

The Unassigned pool is a live attendance queue: show only unassigned members
currently in the configured main voice channel. Do not delete or alter members
who are away; they remain in the roster and can still be moved from a party or
Reserve.

## Class Visuals

Use original placeholders/icons.

In the Add Member sheet, use a native, mobile-friendly dropdown grouped by
Ragnarok: The New World launch classes and current second-job advancements. Keep
the selected class name as the member's visible identity and provide an
Other/custom option for future unsupported jobs.

Roster import must be a focused mobile-friendly sheet: choose a file, show a
small preview and clear validation feedback, then use one confirmation action.
An optional Discord User ID column is bot-only and must not be shown or exposed
in the browser import preview. Do not make users leave the party setup page or
manually edit database rows.

Possible visual language:

- Paladin: shield/cross
- Knight: sword/shield
- Sniper/Hunter: bow/target
- Assassin: dual blades
- Wizard: staff/rune
- Priest: holy/cross symbol
- Bard: lyre/music
- Dancer: fan/music

Do not copy official game icons.

Do not show Tank, DPS, Healer, or Support labels. Use the class name as the member&apos;s visible identity.

When many parties exist, desktop cards must wrap onto additional rows with no
horizontal page scroll. Party titles must wrap instead of being clipped by their
header actions.

## Drag and Drop

Desktop dragging should:
- lift the active card
- use slight scale
- hide the original position while dragging
- highlight valid drop zones

Keep the compact drag preview free of a cast background/shadow.
Keep the preview centered beneath the pointer while dragging.

Invalid destinations need a clear non-color-only indicator.

## Empty Slots

Use intentional empty states:

```text
┌─────────────┐
│      +      │
│ Empty Slot  │
└─────────────┘
```

Use dashed muted-green borders.

During drag hover, show `Drop here`.

## Reserve

Reserve is visually secondary to active parties.

Keep it within the same dark-green brand but with a slightly subdued treatment.

## Typography

Prefer:
- Geist
- Inter
- Noto Sans

Do not use difficult fantasy fonts for normal UI text.

Fantasy identity should come from emblem, iconography, borders, imagery, and subtle decorative elements.

Character names: 600–700 weight.

Secondary data: 400–500 weight.

## Shape

Suggested radii:

```text
Panel: 12px
Card: 10px
Button: 8px
Input: 8px
Badge: pill
```

Avoid excessive rounding.

Most borders: 1px.

## Buttons

Primary:
- dark emerald
- brighter green hover
- white/light text

Secondary:
- dark/transparent surface
- green border

Danger:
- dark red treatment

Keep actions compact.

## Icons

Prefer Lucide React for standard interface icons.

Examples:
- Shield
- Swords
- Users
- Search
- Plus
- Trash
- GripVertical
- RotateCcw
- ChevronDown

## Motion

Keep interaction animation around 150–250ms.

Use motion for:
- hover
- drag/drop
- bottom sheet/modal
- card movement

Avoid constant glowing, particles, or large page transitions.

## Empty States

No parties:

```text
No parties yet

Create your first party to start organizing HorizOn.

[ + Create Party ]
```

No unassigned:

```text
Everyone is assigned ✓
```

No members:

```text
No guild members yet.

Add members to start building parties.
```

## Design Priority

When rules conflict:

1. Usability
2. Readability
3. Speed
4. Guild identity
5. Visual effects

The desired result:

> A dedicated HorizOn guild tool that feels at home beside a fantasy RPG while remaining as efficient as a modern web application.
