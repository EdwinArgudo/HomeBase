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
- `lib/http/` holds the shared request and response rules every adapter obeys:
  size-capped JSON bodies, bounded route ids, and the single translation from a
  thrown value to a JSON response.

Domain modules depend on auth, database, and shared household types. They do not
depend on React, Vinext, route files, or page components. Plaid and current API
routes continue using the facade.

## Adapters

Each domain owns an `http.ts` that turns requests into service calls. An adapter
takes its collaborators as injected dependencies, so it is testable without a
framework, a route, or a database.

An adapter may validate a request and shape a response. It may not make an
authorization decision: services return domain data or throw `HttpError`, and
`lib/http/errorResponse` is the only place that decides what a caller is allowed
to read. Anything that is not an `HttpError` answers 500 with a fixed message,
so an internal failure cannot leak its detail to the browser. No authorization
decision may be delegated to a Vue component or inferred from whether a control
is visible.

Per `DECISIONS.md` D-002 there is no Hono rewrite on the path. These adapters
are the API surface, not a staging post toward another one.
