# n8n workflows

n8n owns all outbound side effects (R5 / ADR-02): Airtable projection, Telegram
pings, member email, the 24h deposit-expiry job, the nightly reconciliation,
and the health-check poller. Decisions live in Postgres; only *delivery* lives here.

## Versioning convention
Workflows are exported as JSON into `workflows/` and committed with the change
that motivated them (Settings → Download in n8n). The export is the review
artifact; the n8n instance is just the runtime. Never let the instance drift
ahead of the repo.

## Workflows to build (Day 2 skeleton → Day 7 full)
| File (expected) | Trigger | Job |
|---|---|---|
| `outbox-consumer.json` | Webhook (Supabase DB webhook nudge) **and** 60s cron sweep | Pull unprocessed outbox rows, dedupe on `dedupe_key`, branch by topic → Airtable upsert / Telegram ping / member email; mark `processed_at`; on failure increment `attempts`, backoff, then dead-letter + alert |
| `deposit-expiry.json` | Cron (15 min) | `awaiting_deposit` older than 24h → set actor `system:expiry`, transition to `cancelled`, notify member + Dana |
| `reconciliation.json` | Cron (nightly) | Count/compare Supabase vs Airtable; post one-line result (or drift report) to Dana's Telegram |
| `health-check.json` | Cron (5 min) | GET `/api/health`; alert on failure or outbox age breach |
| `error-workflow.json` | n8n error trigger | The alarm on the alarm: any workflow failure → Telegram alert + `dead_letters` row. Set as the instance-level error workflow. |

## Rules
- Every branch terminates in success-mark or dead-letter — no silent ends.
- Consumers are idempotent; assume at-least-once delivery always.
- Credentials live in n8n's credential store, never inside exported JSON
  (n8n exports reference credentials by name — verify before committing).
