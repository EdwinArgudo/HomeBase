# Homebase Vue Client

This directory contains the Vue/Hono implementation of the Homebase Living
Game. It is embedded as the sole Homebase product shell at `/` and uses authenticated daily moves,
progress, the current member's persistent manual persona, and a privacy-filtered
household persona projection. It also materializes permanent, deterministic
emblem rewards from canonical completion progress.

## Stack

- Vue 3 Single-File Components with TypeScript and `<script setup>`
- Vite, Vue Router, and Pinia
- Hono on a Cloudflare Worker
- Cloudflare Workers Static Assets for the compiled Vue SPA
- Vitest and Vue Test Utils
- Shared runtime contracts from `packages/contracts`

## World-shell scope

- A responsive household world with selectable personas
- A gentle three-move daily loop backed by Pinia
- Cooperative adventure, persona progress, detailed ledger, and apartment
  display routes
- A display-only projection whose personas, items, and adventures are all
  explicitly safe for a shared screen
- Reduced-motion, keyboard-focus, screen-reader summary, and forced-colors
  accommodations

In the embedded root build, daily moves, their complete/defer/replace
actions, canonical current-member/household progress balances, and the current
member's allow-listed manual persona appearance are live authenticated data.
The Persona Reward Shelf is also live: it shows five permanent v1 emblems and
only unlocks them when canonical completion events support the stored progress.
The current member can equip one unlocked emblem or remove it; that verified
loadout appears on their Persona and on every household-authorized World
projection. Emblems do not create World items or decorations.
World includes the current member's saved persona and only approved,
household-visible partner personas. Plans and Ledger use their focused live
boundaries. The embedded client never falls back to live-domain fixtures when
authentication, storage, or networking fails. Access uses the existing private
Sites project boundary; the client does not imitate authentication.

## Embedded private application

The root project stages a Vue-only browser build and serves it from the same
Vinext/Sites deployment at:

```text
http://localhost:3000
```

From the repository root, stage the embedded assets before starting the local
root server:

```sh
npm run build:homebase-client
npm run dev
```

Vue Router uses `/` as its embedded base, so routes such as
`http://localhost:3000/persona` refresh through the root catch-all. Old
`/living-game/*` bookmarks redirect through Vue compatibility routes. The
generated browser assets live under `public/homebase-app/`; they are
ignored and must not be committed. The normal standalone Vue/Hono build remains
available through this package's `npm run build` command.
That standalone build explicitly installs fixture move, progress, persona,
world, and reward adapters so local UI development and tests do not depend on
the root authenticated APIs.

## Local development

From this directory:

```sh
npm install
npm run dev
```

The Vite development server serves both the Vue application and the Worker API.
The Worker health boundary is available at `GET /api/health`.

## Validation

```sh
npm run type-check
npm test
npm run lint
npm run build
```

The standalone generated build is local-only. The embedded browser application
is published as part of the existing private root Sites deployment; it is not a
second application. Rollback uses Git and Sites version history rather than a
parallel legacy route.
