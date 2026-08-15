# Homebase game domain

`@homebase/domain-game` contains pure, deterministic Living Game policies. It
depends only on `@homebase/contracts` and must not import framework, request,
storage, authentication, AI, or clock modules.

## Policy v1 daily moves

`selectDailyMovesV1` filters candidates to one authorized household/member,
suppresses duplicates and cooldown sources, scores declared signals, and then
greedily favors family diversity. Stable source/content keys break ties, so
results do not depend on candidate input order. It returns at most three
contract-validated moves, or one while Minimum Mode is enabled.

Callers provide the local date, creation timestamp, and ID factory explicitly.
The selector never reads current time and does not use randomness. Persistence
is deliberately outside this package; the server snapshot service owns the
read-before-select and insert-or-ignore boundary.

## Progression policy v1

Every completed move grants exactly 10 personal points in its move family.
Shared moves additionally grant 4 household points. `levelForLifetimePointsV1`
maps each complete block of 100 points to the next level, starting at level 1
and capped at the contract maximum of 1,000. The policy exposes no decay,
streak, missed-day, or negative-point operation. Canonical completion events
contain only family, ownership, and these server-derived awards.
