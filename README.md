# Cabana

Member portal + operations layer for **Sailfish Pool Care** — a fictional
3-tech residential pool service company in Jupiter, FL. Real system, invented
client: member names, addresses, and service records are fabricated for
demonstration. The repository also contains the author’s project documentation.

Members submit requests through the portal. Claude Haiku classifies each request
and drafts an acknowledgment for staff. Application rules route repairs to a
$75 Stripe test deposit or send the request to review. Staff control approval
and visit times. Booking changes create outbox events for n8n to update Airtable
and notify the owner. Failed deliveries are retried or recorded in a dead-letter
queue for follow-up.

The member interface shows recorded request and payment states. It does not
present AI acknowledgments as staff replies or infer a human review from triage.
A weekly plan day is shown separately from an assigned visit window.

Stack: Next.js 15 (Vercel) · Supabase (Postgres/Auth/RLS/Edge Functions) ·
Stripe · n8n (Railway) · Airtable · Telegram Bot API · Claude Haiku · Resend.

**Status: `v1.0` — tagged.** Gates 1, 2, and 3a (chaos) are closed, the portal has **a one-click
public demo** — enter as a seeded member (fictional data, Stripe in test mode),
no sign-up. A walkthrough Loom and the Claude Desktop hour are optional
follow-up assets, not release gates.
Built across Days 0–8 by one engineer pairing with Claude Code; the daily
narrative (decisions, surprises, incidents, deliberate omissions) is
[`docs/log.md`](docs/log.md).

## Failure modes & production notes

Detection and handling for the integration failure paths. (Source: [`docs/02-architecture.md`](docs/02-architecture.md) §6;
the chaos run exercised most of these live.)

| Failure | Detection | Handling | Remaining limitation / recorded result |
|---|---|---|---|
| Stripe webhook endpoint down | Stripe dashboard + reconciliation vs. `payments.pending` age alert | Stripe retries ~72h; idempotent processing on recovery | Payment confirmation can be delayed; unresolved payments require reconciliation |
| Duplicate / out-of-order Stripe events | `stripe_events` PK conflict | Conflict → ack 200, skip; state machine ignores stale transitions | No duplicate updates observed in the recorded replay test |
| n8n down | Health-check probe (outbox depth + oldest-unprocessed age → 503 → alert) | Outbox holds everything; sweep drains on recovery | Deliveries delayed; the recorded run stopped the consumer for 90s and drained the backlog after recovery |
| Airtable API failure / auth break | Workflow error path + per-row `last_error` | Backoff retries → dead-letter + Telegram alert; nightly reconciliation catches residue | Office view can be stale; the recorded run produced 50 Airtable records for 50 bookings after an approximately 25-minute auth outage |
| Telegram API down | Send-step error path; alert channel falls back to **Resend email** | Retry, then dead-letter the Telegram leg *alone* + alert — the delivery legs are decoupled ([#20](https://github.com/kristenmartino/cabana/issues/20)), so the Airtable projection already landed | Owner ping delayed / in DLQ; office view unaffected — the Railway↔Telegram flake is real, tracked, and now contained |
| AI timeout / malformed output | zod + 2s budget, `ai_events.outcome` | `needs_review` + holding reply; the member flow cannot throw on a model failure | Staff review; missing-key fallback was exercised during the build and recorded chaos run |
| Prompt injection in member text | CI requires all marked containment cases to pass | Application limits routing to review or a repair deposit; AI drafts are kept off member status pages | Misclassification can still produce an inappropriate deposit request; tests cover a finite set of cases |
| Double-booking race | DB `gist` exclusion constraint | Second writer gets a structured conflict | Conflicting assignment must be rescheduled |
| DST transition | [`tests/dst/`](tests/dst/dst.test.ts) pins both 2026 boundaries | UTC storage; `America/New_York` applied only at render; range math in SQL | Fixtures cover the tested boundaries |
| Deposit paid, member never returns | Webhook is the authority; the redirect is cosmetic | Status advances when a verified webhook is processed | Webhook processing may be delayed |
| Secrets leakage | gitleaks over full history in CI; rotation runbook below | Rotate + revoke — **exercised twice for real during the build** (Stripe test key, Telegram bot token) | RLS does not protect against a leaked service-role key; revocation is required |
| Office edits a non-whitelisted Airtable field | Next sync + `sync_log` | Overwritten + logged (documented behavior, not surprise) | Momentary confusion, audited |

## Evidence (M1–M6)

| Metric | Claim | Evidence |
|---|---|---|
| M1 | Local setup target: ≤ 10 min | Quickstart below; a timed clean-clone run is not recorded here |
| M2 | submit → processed p50 858.5s, p95 2478s | [Recorded chaos log](scripts/chaos/runs/cx20260706T2052.log), including injected outages; this is not a healthy-pipeline latency benchmark |
| M3 | 50/50 Airtable records, no duplicate records | [Recorded chaos log](scripts/chaos/runs/cx20260706T2052.log): 103 outbox rows, 43 dead-lettered, none left in limbo; no duplicate booking-created events or status transitions |
| M4 | owner decision ≤ 2 taps | Telegram Approve is 1 tap; duplicate delivery + double-tap no-op proven in the chaos run (exactly one audit row) |
| M5 | CI target: ≥90% overall; all marked containment cases pass | [20-case golden suite](tests/golden/golden.test.ts); temperature 0 reduces sampling variation but does not establish deterministic behavior or general containment |
| M6 | every payment transition traceable to a verified stored event | `stripe_events` ledger + [webhook suite](tests/webhooks/stripe.test.ts) + chaos A4 |

These results describe one recorded run at demo volume. They do not establish
production reliability, universal prompt-injection containment, or load capacity.

## Start here

| Read | Why |
|---|---|
| [`docs/00-discovery.md`](docs/00-discovery.md) | The scoping call — nine questions, what each de-risks, and the answer→requirement traceability table |
| [`docs/01-prd.md`](docs/01-prd.md) | Requirements R1–R8 with acceptance criteria; non-goals NG1–NG7 (the scope cuts are the point) |
| [`docs/02-architecture.md`](docs/02-architecture.md) | The system: outbox, status machine, projection fence, AI contract |
| [`docs/03-decisions.md`](docs/03-decisions.md) | 9 ADRs — every consequential fork, with the options that lost |
| [`docs/04-build-plan.md`](docs/04-build-plan.md) | 10 days, 3 gates, the ordered cut list, and the never-cut floor |
| [`docs/log.md`](docs/log.md) | The build as it actually happened — incidents included |

## Quickstart (local)

Prereqs: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli).
(Stripe CLI only if you want the live money path locally.)

```bash
npm install
supabase start
supabase db reset           # migrations + seed.sql: a full demo world
cp .env.example .env.local  # fill the Supabase block from `supabase start` output
npm run dev                 # http://localhost:3000
```

Magic-link sign-in locally: use a seeded member email; the link lands in
Mailpit (`supabase start` prints its URL). Add `ANTHROPIC_API_KEY` to
`.env.local` to run real triage; without it, intake still works — every
request routes to `needs_review` with the holding reply (that fallback *is*
the designed behavior, not a degraded mode).

Money path, locally — the edge runtime reads Stripe keys from
`supabase/functions/.env` (git-ignored); `stripe listen` prints the webhook
secret:

```bash
printf 'STRIPE_SECRET_KEY=sk_test_...\nSTRIPE_WEBHOOK_SECRET=whsec_...\n' > supabase/functions/.env
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

**Live demo:** the app is publicly accessible with a one-click demo session
(ADR-10). The landing at `/` shows a public Sailfish Pool Care page; "Enter the
demo" creates a real authenticated session for Ken Alvarez (seeded fictional
member, id a1000000...), so reviewers see the app live with RLS applied
identically to a real member. Stripe is test-mode; intake is IP-rate-limited
for demo only (real members never throttled). A non-member email on sign-in
gets a polite dead end. Architecture at a glance lives in [`docs/02-architecture.md`](docs/02-architecture.md).

## Testing

```bash
npm run typecheck && npm run lint
npm test               # unit + DST fixtures (no network)
npm run test:golden    # 20-case AI gate: ≥90% overall, 100% containment (needs ANTHROPIC_API_KEY)
npm run test:rls       # adversarial RLS suite vs the local stack (18 tests, 3 JWT fixtures)
npm run test:webhooks  # Stripe replay / out-of-order / signature suite (12 tests)
npm run chaos          # the M3 evidence generator — see scripts/chaos/README.md
```

All of these gate in CI (`.github/workflows/ci.yml`): the `db` job boots a
real local Supabase and refuses to pass on a vacuous suite; `golden` runs
live against Haiku; gitleaks scans full history.

## Rotation runbook

Exercised twice during the build: the Telegram bot token after it appeared in
an n8n execution-log excerpt shared while debugging (Day 4 in the log), and
the Stripe test key as the first rotation (Day 8 records the origin).

| Secret | Rotate at | Then update |
|---|---|---|
| Stripe test keys | Stripe dashboard → API keys → Roll | Vercel env + `.env.local` |
| Stripe webhook secret | Webhook endpoint → Roll secret | Supabase edge-fn secrets |
| Telegram bot token | @BotFather `/revoke` | Railway n8n `TELEGRAM_BOT_TOKEN` + Supabase edge-fn secrets (webhook re-register not needed) |
| Airtable PAT | airtable.com/create/tokens → regenerate | n8n `Airtable` credential (value is `Bearer <pat>`) |
| Supabase service role | Dashboard → Settings → API → rotate JWT secret (rotates all keys) | Vercel env, edge fns re-read automatically, n8n `Supabase` credential |
| Anthropic API key | console.anthropic.com → revoke + create | Vercel env + Supabase edge-fn secrets + GitHub Actions secret |

## Cost notes (what this actually runs on)

Supabase paid-org project (ADR-09 records $10/mo compute at setup) · Vercel
Hobby · Railway ~$5/mo for n8n (chosen over n8n Cloud specifically because the
chaos test needs a kill switch) · Stripe test mode $0 · Airtable free tier ·
Telegram $0 · Resend free tier (100/day) · Anthropic: Haiku triage at
temperature 0 runs ~1,000 input / ~160 output tokens per intake — pennies per
hundred requests.

## Repo map

```
docs/                 discovery → PRD → architecture → ADRs → build plan · execution plan · log
supabase/migrations/  0001–0006 schema/outbox/RLS · 0008 transition_booking · 0012 member intake
                      0013 apply_triage · 0014 deposit expiry · 0015 get_schedule
                      0016 rate_limit · 0017 reset_demo_member · 0018–0019 delivery fixes
supabase/seed.sql     the demo world (fixed UUIDs, a booking in every status)
supabase/functions/   stripe-webhook · telegram-webhook (/today /week /cancel /brief) · airtable-writeback
lib/triage/           zod schema + routing policy · Haiku caller (2s budget, temp 0, fallback-first)
lib/stripe/           hosted Checkout session creator
lib/portal/           RLS-scoped read layer for the member UI
prompts/triage/       v1 (immutable) · v2 (live) — versioned AI contract
tests/                golden (20-case gate) · rls (adversarial) · webhooks (replay) · dst (boundaries)
ops/n8n/workflows/    outbox-consumer · deposit-expiry · health-check · error-workflow · reconciliation
scripts/chaos/        the M3 evidence generator + runbook; runs/ holds committed evidence
app/                  member portal (Next 15 app router; presentation from a fenced Lovable scaffold, ADR-05)
docs/marie-console.md the office console guide (one page, non-technical)
CLAUDE.md             conventions + never-cut list for Claude Code sessions
```

## Demo scope and limitations

- The client is fictional; the failure modes are not. Two secrets really were
  rotated, a real Railway↔Telegram network flake is tracked and mitigated
  ([#20](https://github.com/kristenmartino/cabana/issues/20)), and chaos day
  found a real DLQ-semantics bug ([#23](https://github.com/kristenmartino/cabana/issues/23))
  which is now fixed (0018) — that's what chaos day is for.
- The member email leg was never built — C3, the pre-agreed cut list's third
  entry; the cut is recorded in the log (Day 8) and the chaos log states the
  adapted assertion rather than pretending.
- Deliberately deferred, and named so a reviewer doesn't have to catch them:
  the Telegram bot **refuses and logs** unauthorized chats but does not yet
  rate-limit or alert on them (R7's last clause — a v1.5 hardening); the
  **Replit spike** (a Day-1 Telegram hello-world) was cut once the real edge
  function was proven live, so there's no Repl link to show. Both are in the
  log, not swept under it.
- Open follow-ups live in the issue tracker; parked ideas in
  [`docs/parking-lot.md`](docs/parking-lot.md). Deferred work and operational limitations are recorded there.

## License

MIT — see [LICENSE](LICENSE). Demonstration project; all data fictional.
