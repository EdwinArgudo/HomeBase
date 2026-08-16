# Homebase

Homebase is a phone-first household PWA for couples. It brings fixed category budgets, Mine/Yours/Ours accounting, shared tasks, groceries, and flexible goals into one calm daily rhythm.

## Current build

The first build is an interactive prototype with realistic demonstration data. It includes:

- Today, Money, Home, and Goals views
- Mine/Yours/Ours budget scopes
- Fixed category limits and a transaction review interaction
- Shared tasks and a grocery list
- Minimum Mode for guilt-free goal recovery
- A full-screen apartment display
- An installable web-app manifest
- Durable D1-backed tasks, groceries, transaction review, and Minimum Mode
- Private signed-in household membership and partner invitations
- Perspective-safe Mine/Yours/Ours accounting for both members

Financial accounts are still represented by seeded demonstration data and no financial provider is connected. See `docs/FIRST_BUILD.md` for accounting rules, security boundaries, and the implementation sequence.

## Local development

Requires Node.js 22.13 or newer. `npm install` also installs `apps/living-game`,
which the build and the Vue test suite need.

```bash
npm install
npm run dev
```

`npm run dev` runs two things: the Homebase server on
<http://localhost:3000>, and a watcher that builds the Living Game bundle the
`/living-game` route serves. Vue edits rebuild in well under a second and the
page reloads itself, so there is no separate build step while developing.
Either process can also be run alone with `npm run dev:app` and
`npm run dev:living-game`.

The dev server starts with an empty local database, so every household request
answers `503` until the checked-in migrations are applied. In a second terminal:

```bash
npm run db:migrate:local
```

This applies `drizzle/` migrations in journal order to the local Miniflare D1
database and records what it applied, so it is safe to re-run after generating a
new migration. Deployed environments are migrated by the hosting control plane;
this command only touches local state.

Then open <http://localhost:3000> once. The first signed-in visitor becomes the
household owner and seeds demonstration data — the Living Game at
<http://localhost:3000/living-game> reads that household and cannot bootstrap one
on its own yet.

If a local database predates this command, or local state gets into a shape you
do not want, reset it: stop the dev server, run `npm run db:reset:local`, start
the dev server, then migrate again. Local data is seeded demonstration data.

### Working on the Living Game

The `/living-game` route above is the one backed by real household data. For UI
work that does not need a database, the Vue app also runs on its own:

```bash
npm --prefix apps/living-game run dev
```

That serves <http://localhost:5173> with Vue HMR, using the fixtures in
`src/client/fixtures/game.ts`. It has no Homebase API behind it: the live API
clients are selected by the `VITE_LIVE_*` flags, which only
`vite.preview.config.ts` sets.

## Verification

| Command | Covers |
| --- | --- |
| `npm test` | Build, Node domain/route suites, and the Vue component suite |
| `npm run lint` / `npm run lint:living-game` | ESLint for the root app and the Vue app |
| `npm run type-check` | `vue-tsc` over the Vue app |
| `npm run build` | The deployable build |

CI runs the same commands on every push and pull request.
