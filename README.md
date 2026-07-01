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
Stripe · n8n · Airtable · Telegram Bot API · Claude Haiku.

## Start here

| Read | Why |
|---|---|
| [`docs/02-architecture.md` §6 — failure modes](docs/02-architecture.md) | The table that explains what this build is actually for: every integration, how it fails, how failure is *detected*, and the worst case after handling |
| [`docs/00-discovery.md`](docs/00-discovery.md) | The scoping call — nine questions, what each de-risks, and the answer→requirement traceability table |
| [`docs/01-prd.md`](docs/01-prd.md) | Requirements R1–R8 with acceptance criteria; non-goals NG1–NG7 (the scope cuts are the point) |
| [`docs/03-decisions.md`](docs/03-decisions.md) | 8 ADRs — every consequential fork, with the options that lost |
| [`docs/04-build-plan.md`](docs/04-build-plan.md) | 10 days, 3 gates, the ordered cut list, and the never-cut floor |

## Status: Day-0 scaffold

**Complete and load-bearing**

- Migrations `0001`–`0006`: full schema; status machine enforced by trigger
  (illegal transitions raise, every transition audited with an actor); tech
  double-booking prevented by a `gist` exclusion constraint under concurrency;
  transactional outbox with dedupe keys and emit triggers; RLS on all 16 tables
  with default-deny writes; `set_actor()` helper.
- `supabase/seed.sql`: full demo world — 6 members, 3 techs, 3 plans, service
  zips, and a booking in **every** status the UI/bot/Airtable views must handle.
- The AI contract: `prompts/triage/v1.md` (versioned, immutable once
  referenced) + `lib/triage/schema.ts` (zod, routing policy, forbidden-commitment
  tripwires) + `tests/golden/intake.json` (20 labeled cases incl. 2 prompt
  injections) + the CI runner that enforces ≥90% overall and **100% containment**.
- CI: typecheck, lint, unit tests, gitleaks over full history, golden set as a
  named job. PR template with a traceability line and a never-cut checkbox.
- Edge-function skeletons with the security patterns already in place: Stripe
  signature verification + `stripe_events` idempotency ledger; Telegram secret
  token + chat allowlist; Airtable write-back whitelist enforcement.

**Stubbed with `TODO(D#)` markers** (D# = build-plan day): edge-function
business wiring (D6/D8), RLS test implementations (D4 — the adversarial
checklist is written), chaos script (D9 — procedure documented), n8n workflow
exports (D2/D7 — specs in `ops/n8n/README.md`), member UI (D3 — arrives via
the fenced Lovable scaffold, ADR-05).

## Quickstart (local)

Prereqs: Node 22+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli),
Stripe CLI (Day 6+).

```bash
npm install               # see Day-1 checklist: reconcile versions, commit lockfile
supabase init             # generates supabase/config.toml; existing migrations are kept
supabase start
supabase db reset         # applies migrations 0001–0006 + seed.sql
cp .env.example .env.local  # fill from `supabase status` output; see the file's comments
npm run dev               # http://localhost:3000
npm run typecheck && npm run lint && npm test
```

Money path (Day 6+):

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Telegram (Day 1 spike / Day 8): expose the function via a tunnel, register with
`setWebhook` including `secret_token=$TELEGRAM_WEBHOOK_SECRET`, message the bot
once, read your chat id from the update, and insert it into `telegram_chats`
(commented example at the bottom of `supabase/seed.sql`). The bot refuses every
chat not on that allowlist.

## Repo map

```
docs/                 discovery → PRD → architecture → ADRs → build plan · log · parking lot
supabase/migrations/  0001 core · 0002 bookings+status machine · 0003 payments+stripe ledger
                      0004 outbox/ai_events/allowlist · 0005 RLS+write lockdown · 0006 set_actor
supabase/seed.sql     the demo world (fixed UUIDs, relative dates)
supabase/functions/   stripe-webhook · telegram-webhook · airtable-writeback
lib/triage/           zod schema + routing policy · Haiku caller (2s budget, fallback-first)
lib/supabase/         server (SSR cookies) · client (anon, RLS-guarded) · admin (service role + setActor)
prompts/triage/v1.md  the versioned AI contract
tests/golden/         20-case golden set + CI runner (containment hard-fails)
tests/rls/            three-fixture adversarial suite (checklist written, impl D4)
ops/n8n/              workflow specs + exported-JSON versioning convention
scripts/chaos/        Day-9 procedure + stub; runs/ holds committed evidence
app/, middleware.ts   minimal shell + auth gate; member UI lands Day 3 (ADR-05 fence)
CLAUDE.md             conventions + never-cut list for Claude Code sessions
```

## Day-1 checklist (first hour)

1. `npm install` — dependency versions in `package.json` were written offline
   as starting points. Resolve any drift (notably `@supabase/ssr` and
   `@anthropic-ai/sdk`), verify the SSR cookie patterns in `lib/supabase/` and
   `middleware.ts` against current Supabase docs, then **commit the lockfile**.
2. Create cloud projects: Supabase, Vercel, Stripe (test mode), Telegram bot
   via @BotFather, Airtable base, n8n instance.
3. Resolve blocking open questions **OQ1–OQ3** (`docs/01-prd.md` §10): Airtable
   plan tier for Interfaces, n8n hosting (cloud vs. Railway self-host),
   Supabase free-tier limits. Log answers in `docs/log.md`; amend ADRs if the
   answers change anything.
4. Populate `telegram_chats` with real chat ids.
5. GitHub secrets: `ANTHROPIC_API_KEY` (golden job). Confirm gitleaks passes on
   the initial history.

## Testing

- `npm test` — unit tests (golden set excluded).
- `npm run test:golden` — the 20-case AI behavior gate: ≥90% overall,
  100% on containment cases (injections, out-of-area, complaints, noise).
  Skips cleanly without `ANTHROPIC_API_KEY`.
- `npm run test:rls` — adversarial RLS suite against the local stack: member A
  vs. member B vs. service role, plus booking invariants (double-booking race,
  illegal transitions, outbox dedupe, DST boundary).
- `npm run chaos` — Day 9: 50 bookings under injected failure (n8n killed
  mid-run, Stripe events replayed, Airtable token broken). Pass = zero lost,
  zero duplicated. Output committed to `scripts/chaos/runs/`.

## Honest notes

- Generated as a Day-0 scaffold without network access: SQL, CI, prompts, the
  golden set, and docs are complete; TypeScript compiles-by-inspection but has
  **not** been through `tsc` — that is deliberately Day-1 step 1, not an
  afterthought.
- All vendor pricing/tier assumptions are flagged as open questions rather
  than asserted (OQ1–OQ3).
- The client is fictional; the failure modes are not.

## License

MIT — see [LICENSE](LICENSE). Demonstration project; all data fictional.
