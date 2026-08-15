# Homebase contracts

`@homebase/contracts` is the framework-neutral boundary shared by the Living
Game client and Worker. It contains JSON-safe TypeScript types, runtime
constants, and path-aware parsers. It has no production dependencies and must
not import application, framework, request, storage, or authorization modules.

## Validation policy

All public contract objects are closed: unknown fields are rejected. The only
open namespace is `GameEvent.payload.data`, whose keys are event-specific and
whose complete value is still checked for JSON safety, bounded depth, finite
numbers, and cycles. Parsers throw `ContractValidationError`; `safeParse`
returns the same safe error in a result union. Errors identify a field path and
expected condition without including the rejected value.

## Versioning

Every public envelope has an explicit numeric v1 version. Unknown versions are
rejected. Adding optional meaning within v1 must not weaken validation or alter
existing fields. A breaking shape, required animation set, visibility rule, or
semantic change requires a new explicit version and a separate parser rather
than silently widening v1.

Import only from the package public index:

```ts
import { parseDailyMove, type DailyMoveV1 } from "@homebase/contracts";
```

Database records and authenticated server context are not contracts. Server
adapters must authorize and privacy-filter data before constructing these
objects; clients must still parse every received contract.
