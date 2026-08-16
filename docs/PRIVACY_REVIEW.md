# Privacy and authorization review

**Reviewed:** 16 August 2026, against `main` at the operations work.
**Scope:** every API route, every household query, both world projections, the
audit trail, and telemetry. Selfie handling is out of scope — see D-001.

## Method

Not a checklist. Every `prepare()` statement in `lib/` was extracted and checked
for household scoping, every route traced to where it resolves a member, and
both projections read for what they can reveal about the other person. The
scoping check is reproducible:

```bash
npm run check:scoping
```

The findings below are what that pass produced.

## Findings

### 1. Split deletion was scoped by sequence, not by statement — fixed

`DELETE FROM transaction_splits WHERE transaction_id = ?` appeared in three
places with no `household_id`. None were exploitable: each sits after
`editableTransaction`, which rejects a transaction from another household before
the batch is built. But the safety lived in the order of the function rather
than in the statement, which is the one thing the data model exists to avoid.

All three now carry an `EXISTS` clause tying the split to a transaction in the
acting household. **Zero unscoped statements remain.**

### 2. Every route resolves a member before touching storage — confirmed

All 24 routes resolve membership, either directly or in the service they call.
`/api/plaid/auto-sync` was worth checking specifically, since it reads like a
scheduled job that might run unauthenticated; it calls `requireHouseholdMember`
and only refreshes connections belonging to that household.

Identity is resolved *before* storage opens, and a request without identity is
refused with 401 rather than reaching the database.

### 3. A partner's private state cannot reach the other person — confirmed

Four separate boundaries, each tested:

- **Companion activity** derives only from the viewer's own completions and a
  partner's household-visible ones. A partner's private move leaves their
  companion resting.
- **The wall display** shows only companions shared with the household, never a
  draft or a private one, and expresses nothing but presence and a celebration
  from a display-visible event. A household-visible completion cannot reach it.
- **Transaction detail** for a partner's private purchase is replaced with
  "Personal purchase" by the server, and their private categories arrive as one
  aggregate that cannot be chosen as a filing destination.
- **Progress** reads only the viewer's own dimensions plus the shared household
  balance.

### 4. The audit trail and telemetry cannot carry financial detail — confirmed

`safeAuditMetadata` and `buildTelemetryRecord` both drop keys resembling
amounts, merchants, emails, tokens, and names, and reject free text, regardless
of what a caller passes. Telemetry is stricter because a log line travels
further than a database row: it carries no household or member identifier at
all.

### 5. Errors do not leak internals — confirmed

Route handlers return a safe message and a status; provider errors, SQL, and
binding names never reach the client. The world, rewards, persona, and progress
handlers each have a test asserting an internal error message does not appear in
the response.

### 6. An unclaimed Homebase could be claimed by whoever arrived first — fixed

Bootstrapping only ran against an empty database, so the window was narrow: the
gap between a deployment and the owner's first sign-in, and again any time the
database were recreated. Inside that window, any signed-in visitor became the
household owner and inherited everything built afterwards.

Claiming now requires the address to be named in `HOMEBASE_OWNER_EMAILS`. A
deployment with nothing configured claims nothing at all — refusing costs a
household that has to be configured, against a household that belongs to a
stranger. The refusal is worded identically to an ordinary uninvited account, so
it never reveals whether a Homebase is claimed or merely waiting.

Local development is exempt by identity rather than by configuration: the
localhost fallback is a distinct kind of identity and says so.

## Accepted risks

- **Authentication belongs to the hosting platform** (D-002). A member is whoever
  the platform's headers say they are. The localhost fallback auto-creates an
  owner, which is correct for development and would be a hole anywhere else —
  it is guarded on hostname, not on environment.
- ~~**The first signed-in visitor becomes the owner.**~~ Closed on 16 August
  2026: claiming an unclaimed Homebase now requires the address to appear in
  `HOMEBASE_OWNER_EMAILS`, and a deployment without that configured can be
  claimed by nobody. See finding 6.
- **Bank access tokens are encrypted at rest** with a key from the environment.
  Rotating that key has no procedure yet.
- **No rate limiting** on any route. A household is two people, so this is a
  cost concern rather than a privacy one, but it is unaddressed.

## Not yet reviewable

- Production backup contents — the export path is unverified, so nobody has
  looked at what a backup actually contains in production.
- Plaid Link against real credentials — the flow has only ever run against
  fixtures.
