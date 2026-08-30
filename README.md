# HorizOn Guild Party Manager

A mobile-first internal web application for organizing Guild League parties for the **HorizOn** guild.

## Goal

The MVP has one primary job:

> Make party organization fast and easy on mobile and desktop.

This is an internal tool for a single guild. It is not a public multi-guild platform.

## MVP Features

- Guild member list
- Add guild members with name, a Ragnarok: The New World job dropdown, and optional CP
- Import a roster from an Excel or CSV file with Character Name and Class columns
- Create, rename, and delete parties
- Assign members to parties
- Move members between parties
- Reserve members
- Automatically calculated Unassigned list focused on members currently in the main Discord voice channel
- Prevent duplicate member assignments
- Default party capacity of 5
- Mobile tap-to-assign flow
- Desktop drag and drop
- Search members by character/class
- Manual CP display
- Discord main-voice attendance for linked members
- Guild attendance totals for in voice, linked-away, and not-linked members
- Live Discord voice attendance updates without refreshing the page
- Persist state in localStorage, with optional Supabase shared-database sync
- HorizOn dark-green fantasy theme
- Clear lineup suitable for screenshots/sharing

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- dnd-kit
- localStorage

Supabase shared persistence is supported for the one guild. Do not add other
backend features without a clear requirement.

## Main User Flow

1. Open Party Setup.
2. See unassigned members currently in the configured main Discord voice channel and existing parties.
3. On mobile, tap a member and choose a destination.
4. On desktop, drag members between Unassigned, Parties, and Reserve.
5. Check party capacity and remaining Unassigned members.
6. Check whether linked members are in the main Discord voice channel.
7. Changes persist automatically in the browser and, when configured, to the shared Supabase database.
8. Use the final lineup for Guild League.

## Mobile First

Minimum target viewport: **360px**.

Mobile must not be a shrunken desktop interface.

Primary mobile interaction:

```text
Tap Member
    ↓
Assign / Move bottom sheet
    ↓
Party 1 / Party 2 / Party 3 / Reserve / Unassigned
```

Desktop additionally supports drag and drop.

Mobile and desktop must manipulate the same state and use the same domain logic.

## Desktop Layout

```text
Sidebar | Member Pool | Party Workspace
```

The Party Workspace receives the most visual space.

## Data Models

```ts
export type GuildMember = {
  id: string;
  name: string;
  className: string;
  avatar?: string;
  cp?: number;
};

export type Party = {
  id: string;
  name: string;
  memberIds: string[];
};
```

Default party capacity:

```ts
export const DEFAULT_PARTY_CAPACITY = 5;
```

## Persistence

Use localStorage as the immediate/offline fallback. Supabase is optional shared
persistence for one HorizOn guild; its public URL and publishable key belong in
`.env.local`, never source control.

### Enable shared Supabase data

1. Create a free Supabase project.
2. In its SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill in the Project URL and
   **Publishable** key from Supabase's Connect panel.
4. Restart `npm run dev`.

The first connected device copies its current roster and party setup to the
shared database. Later devices use that shared setup. This starter version has
no login, so anyone with access to the configured app can edit the roster.
Keep the app private until manager authentication is added.

### Deploy the website to Vercel

1. Put this project in a private GitHub repository, then import that repository
   from the Vercel dashboard. Vercel detects Next.js automatically; keep the
   default build command (`npm run build`).
2. In **Project Settings → Environment Variables**, add these values for
   Production (and Preview if you want preview deployments to use the same
   shared roster):

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Deploy, open the generated `*.vercel.app` URL, and add a custom domain later
   if needed.

Only the two `NEXT_PUBLIC_` Supabase values belong in Vercel for this website.
Never add `SUPABASE_SERVICE_ROLE_KEY` or `DISCORD_BOT_TOKEN` there. The Discord
bot is a separate, always-running process and must remain on a computer/server
host that runs `npm run discord:bot`.

### Import a member roster

Use **Import members** in the Member Pool and select an `.xlsx` or `.csv` file.
The first row must include **Character Name** (or **Name**) and
**Class** (or **Job**). The app previews valid rows before import, skips duplicate
character names already in the roster, and saves the imported members using the
normal localStorage/Supabase state flow. A third optional **Discord User ID**
column can be included for bulk Discord linking; the website ignores that
sensitive column and the bot imports it separately. Older files with only
Character Name and Class remain fully supported; those imported members start
as Not linked.

### Enable Discord voice attendance

The bot is intentionally separate from the website. It links a Discord account
to one character through leader-only `/link` and updates the main voice-channel
presence. Add these server-only values to `.env.local` (never use `NEXT_PUBLIC_`
for them):

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_VOICE_CHANNEL_ID=
SUPABASE_SERVICE_ROLE_KEY=
```

Run `npm run discord:bot` in a second terminal while the guild is organizing.
The bot must keep running to receive Discord join/leave events.

If you ran an earlier version of the Discord schema, run
[`supabase/enable-realtime.sql`](supabase/enable-realtime.sql) once in the
Supabase SQL Editor, then restart the bot. The dashboard will update as members
join or leave the configured voice channel; no page refresh is needed.

In Supabase, copy the **Secret key** from **Settings → API Keys** into
`SUPABASE_SERVICE_ROLE_KEY`. Never put that key in code, `NEXT_PUBLIC_` variables,
or a message. Only Discord users with **Manage Server** can use `/link` and
`/unlink` to map a Discord account to an exact HorizOn character name.

### Bulk-link Discord members from Excel

Use the same roster `.xlsx` or `.csv` file, with an optional **Discord User ID**
column. Each ID must be a Discord User ID (not a username) and must be entered
as **Text** in Excel, so its 17–20 digits are not rounded. First import the
roster through the website, then run this in a terminal:

```powershell
npm run discord:import-links -- "C:\path\to\horizon-roster.xlsx"
```

The command verifies every Discord account belongs to the configured server,
matches each exact character name to the shared roster, replaces any previous
link for those characters, and records the current main-voice status. It uses
the existing bot token and Supabase service-role key from `.env.local`; never
put those values in the Excel file.

Suggested storage key:

```text
horizon-party-manager-v1
```

Centralize storage logic in `src/lib/storage.ts`.

Suggested functions:

```ts
loadGuildState()
saveGuildState()
resetGuildState()
```

Handle missing or corrupted data gracefully.

## Guild Branding

The guild name must always be written exactly as:

**HorizOn**

Visual direction:

- Dark forest green
- Black-green
- Emerald
- Lime highlights
- Small gold accents
- Fantasy RPG atmosphere
- Clean and modern management UX

Do not copy official Ragnarok/ROW artwork, logos, UI, or class icons. Use original placeholders or original assets.

## Out of Scope for MVP

Do not implement:

- Authentication
- Manager/member roles
- User accounts
- Multiple guilds
- CP syncing
- General Discord messaging, moderation, or notification features
- Notifications
- AI party generation
- Payments/subscriptions

## Future Possibilities

Only after the MVP is validated:

- Manager authentication
- Supabase/PostgreSQL persistence
- Party templates
- Copy previous lineup
- Guild League history
- Member availability
- Shareable read-only lineup
- Discord integration
- Party suggestions

## Product Priority

1. Mobile usability
2. Correct party-management behavior
3. Fast party organization
4. Simplicity
5. Desktop drag and drop
6. Visual polish

Prefer a small working product over a large architecture.
