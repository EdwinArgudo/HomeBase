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
