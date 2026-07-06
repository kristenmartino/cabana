# Cabana

Member portal + operations layer for **Sailfish Pool Care** — a fictional
3-tech residential pool service company in Jupiter, FL. Real system, invented
client: every name, address, and number in this repo is fabricated for
demonstration. No real PII exists anywhere in it.

**The spine:** a member describes a problem in their own words → Claude Haiku
triages it (confidence-gated, structurally unable to promise price or time) →
qualified repairs collect a $75 deposit via Stripe Checkout (webhook-authoritative,
idempotent) → the owner approves with one tap from Telegram → the office runs
the week from an Airtable projection → a transactional outbox + n8n guarantee
that **no side effect is ever silently dropped**.

Stack: Next.js 15 (Vercel) · Supabase (Postgres/Auth/RLS/Edge Functions) ·
Stripe · n8n (Railway) · Airtable · Telegram Bot API · Claude Haiku · Resend.

**Status: gates 1, 2, and 3a (chaos) closed — every claim below links to
committed evidence. v1.0 ship-out (Loom, Claude Desktop hour, tag) in flight.**
Built across Days 0–8 by one engineer pairing with Claude Code; the daily
narrative (decisions, surprises, incidents, deliberate omissions) is
[`docs/log.md`](docs/log.md).

## Failure modes & production notes

The table a reviewer should read first — "Detection" is the column amateur
builds leave blank. (Source: [`docs/02-architecture.md`](docs/02-architecture.md) §6;
the chaos run exercised most of these live.)

| Failure | Detection | Handling | Worst case after handling |
|---|---|---|---|
| Stripe webhook endpoint down | Stripe dashboard + reconciliation vs. `payments.pending` age alert | Stripe retries ~72h; idempotent processing on recovery | Payment confirmation delayed; never wrong |
| Duplicate / out-of-order Stripe events | `stripe_events` PK conflict | Conflict → ack 200, skip; state machine ignores stale transitions | None — **replayed 5× live in the chaos run, zero effects** |
| n8n down | Health-check probe (outbox depth + oldest-unprocessed age → 503 → alert) | Outbox holds everything; sweep drains on recovery | Notifications delayed, none lost — **killed live for 90s mid-run, backlog of 48 drained clean** |
| Airtable API failure / auth break | Workflow error path + per-row `last_error` | Backoff retries → dead-letter + Telegram alert; nightly reconciliation catches residue | Office view stale, flagged — **a 60s injected auth break accidentally became ~25 min; deliveries still landed exactly-once** |
| Telegram API down | Send-step error path; alert channel falls back to **Resend email** | Retry (10s timeout, 3×), then dead-letter + alert | Ping delayed; visible in DLQ — the Railway↔Telegram flake is real and tracked ([#20](https://github.com/kristenmartino/cabana/issues/20)) |
| AI timeout / malformed output | zod + 2s budget, `ai_events.outcome` | `needs_review` + holding reply; the member flow cannot throw on a model failure | Human triage — the old normal. **Proven both directions in prod** (missing key day, and 5 key-stripped bookings in the chaos run) |
| Prompt injection in member text | Golden set: 100% containment enforced in CI, deterministically (temp 0) | Draft-only authority: the worst output is a bad *draft* that can't commit anything | Odd text in a review queue |
| Double-booking race | DB `gist` exclusion constraint | Second writer gets a structured conflict | None |
| DST transition | [`tests/dst/`](tests/dst/dst.test.ts) pins both 2026 boundaries | UTC storage; `America/New_York` applied only at render; range math in SQL | None |
| Deposit paid, member never returns | Webhook is the authority; the redirect is cosmetic | Status advances regardless | None |
| Secrets leakage | gitleaks over full history in CI; rotation runbook below | Rotate + revoke — **exercised twice for real during the build** (Stripe test key, Telegram bot token) | Bounded by RLS |
| Office edits a non-whitelisted Airtable field | Next sync + `sync_log` | Overwritten + logged (documented behavior, not surprise) | Momentary confusion, audited |

## Evidence (M1–M6)

| Metric | Claim | Evidence |
|---|---|---|
| M1 | clone → running ≤ 10 min | Quickstart below |
| M2 | submit → owner ping p95 | [chaos log](scripts/chaos/runs/cx20260706T2052.log) — annotated: the run includes a 90s consumer kill and a ~25-min auth outage; the guarantee under test is delivery |
| M3 | **0 lost, 0 duplicated** across 50 bookings under injected failure | [chaos log](scripts/chaos/runs/cx20260706T2052.log): A1 50/50 Airtable exactly-once · A2 zero limbo, zero silent · A3 zero duplicates · A4 payments ledger-verified |
| M4 | owner decision ≤ 2 taps | Telegram Approve is 1 tap; duplicate delivery + double-tap no-op proven in the chaos run (exactly one audit row) |
| M5 | golden ≥ 90%, 100% containment | CI `golden` job — deterministic since [#15](https://github.com/kristenmartino/cabana/pull/15): the flake was sampling randomness (temperature previously unset → 1.0, borderline confidences flipped across the 0.8 gate at random); pinned to temperature 0 + prompt v2 hardening |
| M6 | every payment transition traceable to a verified stored event | `stripe_events` ledger + [webhook suite](tests/webhooks/stripe.test.ts) + chaos A4 |

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
supabase db reset           # migrations 0001–0015 + seed.sql: a full demo world
cp .env.example .env.local  # fill the Supabase block from `supabase start` output
npm run dev                 # http://localhost:3000
```

Magic-link sign-in locally: use a seeded member email; the link lands in
Mailpit (`supabase start` prints its URL). Add `ANTHROPIC_API_KEY` to
`.env.local` to run real triage; without it, intake still works — every
request routes to `needs_review` with the holding reply (that fallback *is*
the designed behavior, not a degraded mode).

Money path, locally:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

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

Supabase free tier (the 5-min health probe doubles as keep-warm) · Vercel
Hobby · Railway ~$5/mo for n8n (chosen over n8n Cloud specifically because the
chaos test needs a kill switch) · Stripe test mode $0 · Airtable free tier ·
Telegram $0 · Resend free tier (100/day) · Anthropic: Haiku triage at
temperature 0 runs ~1,000 input / ~160 output tokens per intake — pennies per
hundred requests.

## Repo map

```
docs/                 discovery → PRD → architecture → ADRs → build plan · execution plan · log
supabase/migrations/  0001–0006 schema/outbox/RLS · 0008 transition_booking · 0012 member intake
                      0013 apply_triage · 0014 deposit expiry · 0015 get_schedule (15 total)
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

## Honest notes

- The client is fictional; the failure modes are not. Two secrets really were
  rotated, a real Railway↔Telegram network flake is tracked and mitigated
  ([#20](https://github.com/kristenmartino/cabana/issues/20)), and chaos day
  found a real DLQ-semantics bug ([#23](https://github.com/kristenmartino/cabana/issues/23))
  — which is what chaos day is for.
- The member email leg was never built — C3, the pre-agreed cut list's third
  entry; the cut is recorded in the log (Day 8) and the chaos log states the
  adapted assertion rather than pretending.
- Open follow-ups live in the issue tracker; parked ideas in
  [`docs/parking-lot.md`](docs/parking-lot.md). Nothing was silently dropped —
  that rule applied to the project as much as to the pipeline.

## License

MIT — see [LICENSE](LICENSE). Demonstration project; all data fictional.
