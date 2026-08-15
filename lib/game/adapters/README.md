# Daily-move adapters

These adapters are authenticated server boundaries. Every query is scoped to
the member's household and applies shared/current-member ownership filtering
where a domain can contain personal rows. They select only fields needed to
construct a `MoveCandidate`; bank errors, institution names, transaction
amounts, merchants, and category details are never selected.

Goal classifier v1 is intentionally small and auditable. Amount goals map to
Tend. Session goals map to Move for explicit exercise/movement words and Grow
for explicit learning/language words. Other shared sessions map to Connect;
other personal sessions map to Grow. Changing these keyword sets or fallbacks
requires an explicit policy review.
