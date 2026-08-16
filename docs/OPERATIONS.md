# Operations

What Homebase records about itself, and how to get a household's data back.

## Audit trail

`audit_events` records security-relevant changes. Every row carries the
household, the member who acted, what was acted on, and safe metadata — never an
amount, a merchant, an email, or a token. `safeAuditMetadata` drops anything
resembling those regardless of what a caller passes.

| Action | Written when |
| --- | --- |
| `invitation.saved` | A partner is invited or the invitation is re-sent |
| `persona.visibility_changed` | A companion moves between private and household |
| `bank_connection.created` | A bank is connected or re-linked |
| `budget_limits.changed` | A category limit or its carry-over is changed |
| `transaction.reclassified` | A purchase is marked as, or stops being, a transfer |

Each record is written **in the same batch as the change it describes**, so a
change cannot land without its record and a record cannot survive a failed
change. `tests/audit.test.mjs` proves both directions against the real
migrations.

Read a household's trail with:

```sql
SELECT occurred_at, member_id, action, subject_type, subject_id, metadata_json
FROM audit_events WHERE household_id = ? ORDER BY occurred_at DESC LIMIT 100;
```

## Telemetry

Operational signal is emitted as one structured JSON line per event, captured by
the hosting platform's log stream. A log line travels further than a database
row, so nothing identifying a household, a member, or a purchase goes in one —
`buildTelemetryRecord` strips those fields even when a caller supplies them.

| Event | Fields |
| --- | --- |
| `daily_moves.materialized` | `durationMs`, `candidates`, `selected`, `minimumMode`, `comeback` |
| `daily_move.completed` | `family`, `source`, `reason`, `ok` |
| `world.projected` | `viewer`, `durationMs`, `ok` |

Filter the platform's logs on `"telemetry"` to isolate them. Selection latency
and candidate counts are the two worth watching: a candidate count that falls to
zero means the adapters stopped finding work, which looks identical to a calm
week from the outside.

## Backup and restore

Local:

```bash
npm run db:backup:local
```

Writes `backups/homebase-<timestamp>.json` — every table in dependency order.
Backups are gitignored; they contain real household data.

```bash
npm run db:restore:local -- backups/homebase-<timestamp>.json
```

Clears and refills every table inside one transaction, so a failed restore
leaves the database as it was. **This has been performed**, not just written:
transactions, splits, and personas were deleted and recovered intact.

### Production

The same shape applies, but the export has to come from the hosting platform's
D1 rather than a local file, and that step is **not yet verified**. Before the
beta carries anything a household would miss:

1. Confirm how the hosting platform exposes D1 export — a console download, a
   CLI, or an API.
2. Take one export and restore it into a scratch database.
3. Compare row counts per table against the source.
4. Write the exact commands here, and only then treat backups as real.

Until step 4 is done, assume there is no production backup.

## Before opening the beta

- [ ] Verify the production export and restore above.
- [ ] Run Plaid Link once against real sandbox credentials end to end.
- [ ] Re-read `docs/PRIVACY_REVIEW.md` and confirm nothing has regressed.
- [ ] Confirm the platform retains logs long enough to be useful.
