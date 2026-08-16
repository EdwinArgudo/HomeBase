# Homebase Living Game

This directory contains the Vue/Hono implementation of the Homebase Living
Game. The current React/Vinext application remains the rollback-safe Homebase
experience at `/`. The embedded preview uses authenticated daily moves,
progress, and the current member's persistent manual persona while keeping the
surrounding world as a contract-backed visual preview.

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

In the embedded `/living-game` build, daily moves, their complete/defer/replace
actions, canonical current-member/household progress balances, and the current
member's allow-listed manual persona appearance are live authenticated data.
The apartment scene, any future partner personas, adventures, and Ledger
balances remain preview-only. The embedded client never falls back to move,
progress, or persona fixtures when authentication, storage, or networking
fails. Access uses the existing private Sites project boundary; the client does
not imitate authentication.

## Embedded private preview

The root project stages a Vue-only browser build and serves it from the same
Vinext/Sites deployment at:

```text
http://localhost:3000/living-game
```

From the repository root, stage the preview assets before starting the local
root server:

```sh
npm run build:living-game-preview
npm run dev
```

Vue Router uses `/living-game/` as its embedded base, so routes such as
`http://localhost:3000/living-game/persona` refresh through the root catch-all.
The generated browser assets live under `public/living-game-preview/`; they are
ignored and must not be committed. The normal standalone Vue/Hono build remains
available through this package's `npm run build` command.
That standalone build explicitly installs fixture move, progress, and persona
adapters so local UI development and tests do not depend on the root
authenticated APIs.

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

The standalone generated build is local-only. The embedded browser preview is
published only as part of the existing private root Sites deployment; it is not
a second application or a production-data cutover.
