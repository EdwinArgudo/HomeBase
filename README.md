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

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Use `npm run build` to create the deployable build and `npm test` to verify the rendered Homebase shell.
