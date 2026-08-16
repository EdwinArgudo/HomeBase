# Decision record

Decisions that change the scope or shape of the product, newest first. Each one
supersedes the corresponding section of `LIVING_GAME_TECHNICAL_PROPOSAL.md`
until that document is revised.

## D-001 — Selfie personas are cut; companions come from a fixed roster

**Date:** 2026-08-16
**Supersedes:** proposal §9 (persona generation pipeline), §10.1 (selfie and
generation endpoints), work packages LG-009 and LG-010, and open decisions
§20.1, §20.2 and §20.5.

Household members keep a small creature rather than a likeness of themselves.
Generating a marshmallow from a photograph is a different and weaker idea than
generating a recognizable character, so the selfie pipeline no longer earns the
work or the risk it carries.

**Consequences**

- No R2 bucket, and no `persona_assets`, `persona_generation_jobs`, or
  `cosmetic_catalog` tables.
- No persona-generation provider contract, and no provider ADR.
- No source-image retention window, deletion repair job, or the privacy review
  that handling photographs would have required.
- Members choose from a fixed roster of characters instead of composing one from
  independent appearance axes. A roster keeps every character deliberately
  drawn, and makes the choice a picture rather than four menus.

**Reversal cost:** the appearance contract is versioned and validated at every
boundary, so reinstating generated personas means adding fields and a forward
migration, not unpicking this decision.

## D-002 — Homebase stays on its current hosting for now

**Date:** 2026-08-16
**Supersedes:** proposal §7.2 and §17 Phase 0/7 as they describe moving to a
dedicated Cloudflare Worker, and work package LG-015.

The application keeps running on its current hosting platform, which already
supplies authenticated identity through request headers. That removes the two
largest unknowns in production readiness — building an account system and
migrating household data to a new runtime — at the cost of depending on that
platform for authentication and for whatever custom-domain support it offers.

**Consequences**

- No Hono Worker rewrite. `apps/living-game/src/worker/` was the seed of that
  architecture and is no longer on the path; the Vue client keeps shipping as a
  bundle served by the existing application, calling its API routes.
- The Ledger port targets the existing route handlers rather than a new backend,
  so it is unblocked and is now the longest remaining piece of work.
- Custom domain becomes a question for the hosting platform rather than a
  migration project.
- Authentication remains the platform's. If Homebase ever needs accounts it does
  not control, that is a separate decision and a separate migration.

**Reversal cost:** the domain services are already framework-independent and the
route handlers are thin, so moving later means writing new adapters, not
rewriting the product.
