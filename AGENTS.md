# AGENTS.md

This repository contains the **HorizOn Guild Party Manager**.

## Required Context

Before writing or modifying code, read:

1. `README.md`
2. `PROMPT.md`
3. `DESIGN_RULES.md`
4. `CONTEXT.md`

Treat these files as the current product specification and design source of truth.

## Current Product Scope

Build a mobile-first Guild League party manager for one guild:

**HorizOn**

Current MVP:

- Guild member list
- Add guild members (name, class, optional CP)
- Create/rename/delete parties
- Party assignments
- Reserve
- Derived Unassigned members
- Default capacity of 5
- Mobile tap-to-assign/move
- Desktop dnd-kit drag and drop
- Search/filter
- Class-focused member display
- Manual CP display
- Discord voice-channel attendance for linked members
- localStorage persistence with optional Supabase shared-database sync
- HorizOn dark-green fantasy theme

## Explicitly Out of Scope

Do not implement unless the user changes the requirements:

- Authentication
- Manager/member roles
- Multiple guilds
- CP sync
- General Discord messaging, moderation, or notification features
- Notifications
- AI party generation
- Payments/subscriptions

Do not add speculative features.

## Engineering Priorities

Prioritize:

1. Mobile usability
2. Correct party state
3. Simplicity
4. Fast party management
5. Desktop drag and drop
6. Visual polish

Do not over-engineer.

Required stack:

- Next.js
- TypeScript
- Tailwind CSS
- dnd-kit
- localStorage

Use strict TypeScript. Avoid `any`.

Prefer:
- small focused components
- derived state
- pure helpers
- clear domain types
- one source of truth for assignments

Avoid:
- Redux unless explicitly justified later
- microservices
- repository patterns
- generic enterprise abstractions
- unnecessary backend interfaces
- duplicated mobile/desktop business logic

## Mobile Rule

Mobile-first is mandatory.

Minimum target viewport: 360px.

Mobile users must be able to fully manage parties without drag and drop.

Use tap -> assign/move -> destination selection.

Desktop can add drag and drop on top of the same state/actions.

## State Invariant

A guild member may exist in exactly one of:

- one Party
- Reserve
- Unassigned

Never allow duplicate assignment.

Prefer calculating Unassigned rather than storing a second manually synchronized list.

## Persistence

The app remains usable with localStorage. When configured, Supabase is the shared
source of truth for the one guild's roster, parties, reserve, and Discord voice
attendance. A separate server-only bot process updates Discord links and voice
presence. Keep all credentials in environment variables and do not commit them.

Centralize local persistence under `src/lib/storage.ts` and remote persistence
under `src/lib/supabase.ts`.

Do not scatter storage calls throughout UI components.

## Product Changes

When requirements change:

1. Understand the requested behavior.
2. Update the relevant specification file(s) first.
3. Update `CONTEXT.md` with the current implementation decision and any user-facing behavior change.
4. Update implementation.
5. Keep `README.md`, `PROMPT.md`, and `DESIGN_RULES.md` consistent.
6. Run appropriate lint/typecheck/tests/build checks.
7. Do not silently add unrelated features.

## Completion Behavior

When implementing a task:

- inspect existing code before changing it
- reuse existing patterns when sensible
- keep changes focused
- test important party-state transitions
- update `CONTEXT.md` with completed behavior changes, implementation notes, and checks performed
- report what changed
- report checks performed
- mention remaining limitations only when relevant

When choosing between complexity and simplicity, choose simplicity.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
