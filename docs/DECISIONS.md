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
