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
- A D1-ready relational schema and migration

The interface does not yet write to the database or connect to a financial provider. See `docs/FIRST_BUILD.md` for accounting rules, security boundaries, and the implementation sequence.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Use `npm run build` to create the deployable build and `npm test` to verify the rendered Homebase shell.
