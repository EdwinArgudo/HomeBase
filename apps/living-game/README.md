# Homebase Living Game

This directory is the parallel Vue/Hono implementation of the Homebase Living
Game. It does not replace, modify, or deploy the current React/Vinext
application. The current milestone is a contract-backed, fixture-driven world
shell: it proves the interaction model and privacy boundary before the live
backend is connected.

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

The UI currently reads validated local fixtures. No database, object storage,
Plaid, authentication, production game engine, or backend persistence is wired
into this parallel app yet. The Ledger copy is a visual shell and does not
represent live balances.

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

The generated build is local-only. Do not deploy this parallel application
until the migration plan explicitly reaches the cutover phase.
