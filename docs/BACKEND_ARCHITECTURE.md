# Backend service architecture

The legacy route handlers keep importing `lib/household.ts`, but that file is
now a compatibility facade. It contains no queries or business rules. New code
should import the focused service that owns its domain.

## Boundaries

- `lib/auth/identity.ts` parses authenticated request identity and contains the
  isolated localhost fallback. Identity is resolved before opening storage.
- `lib/household/storage.ts` owns safe D1 access and the migration-readiness
  boundary described in `DATABASE_ARCHITECTURE.md`.
- `lib/household/membership.ts` resolves membership, accepts invitations, and
  performs the one-time owner and household bootstrap. It returns a typed
  context containing the resolved identity, member, and database.
- `lib/household/authorization.ts` contains shared household, ownership, scope,
  and merchant-normalization rules.
- `snapshot.ts`, `invitations.ts`, `home.ts`, `budgets.ts`, `transactions.ts`,
  and `settings.ts` own their respective read models and mutations. They accept
  or obtain a resolved household context and keep every query household-scoped.
- `home-queries.ts` is the narrow task and grocery mutation boundary used to
  behaviorally verify cross-household denial.

Domain modules depend on auth, database, and shared household types. They do not
depend on React, Vinext, route files, or page components. Plaid and current API
routes continue using the facade until their dedicated Hono routes are built.

## Hono reuse

Future Hono middleware will resolve identity and membership once, attach the
typed household context to the request, and call these domain services. The
services return domain data or throw `HttpError`; framework adapters remain
responsible only for request validation and translating those results into the
existing JSON response shapes. No authorization decision may be delegated to a
Vue component or inferred from whether a control is visible.
