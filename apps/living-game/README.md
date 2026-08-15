# Homebase Living Game

This directory is the parallel Vue/Hono migration foundation for Homebase. It
does not replace, modify, or deploy the current React/Vinext application.

## Stack

- Vue 3 Single-File Components with TypeScript and `<script setup>`
- Vite, Vue Router, and Pinia
- Hono on a Cloudflare Worker
- Cloudflare Workers Static Assets for the compiled Vue SPA
- Vitest and Vue Test Utils

No database, object storage, Plaid, authentication, game-domain, or production
integration is included in this foundation.

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
