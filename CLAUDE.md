# CLAUDE.md — Cabana

Member portal + ops automation for Sailfish Pool Care (fictional client, real
system). Next.js 15 on Vercel · Supabase (Postgres/Auth/RLS/Edge Functions) ·
Stripe Checkout · n8n · Airtable · Telegram · Claude Haiku triage.

**Read before large changes:** `docs/01-prd.md` (requirements R1–R8, non-goals),
`docs/03-decisions.md` (ADRs — don't relitigate silently), `docs/04-build-plan.md`
(gates, cut list). Requirements trace to discovery answers (`docs/00-discovery.md`);
keep that chain intact when scope moves.

## Commands

```
npm run dev            # Next.js dev server
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # unit tests (golden set excluded)
npm run test:golden    # 20-case AI golden set — needs ANTHROPIC_API_KEY
npm run test:rls       # RLS adversarial suite — needs local supabase running
npm run db:reset       # supabase db reset: migrations + seed.sql
npm run chaos          # Day-9 chaos run (see scripts/chaos/README.md)
```

Local stack: `supabase start`, then `stripe listen --forward-to
http://127.0.0.1:54321/functions/v1/stripe-webhook`. Telegram dev needs a
tunnel; register with setWebhook + secret token (see the function header).

## Non-negotiables (the never-cut list)

Never weaken, even "temporarily," even mid-debug:
1. **RLS + its test suite.** Security lives in `0005_rls.sql`, not in UI filters.
2. **Webhook verification + idempotency.** Payment truth = verified Stripe
   events recorded in `stripe_events`. The success redirect is cosmetic.
3. **The outbox.** Status changes and their events commit in one transaction.
   Never call Airtable/Telegram/email directly from app code — emit, let n8n deliver.
4. **The AI fallback path.** Triage failure → `needs_review` + holding reply.
   The member flow must never throw because a model call failed.
5. **The chaos test** stays green (`docs/04-build-plan.md` §3 has the full list).

## Conventions

- **Writes:** browser writes nothing except `properties.access_notes` (column
  grant). Everything else goes through server actions / edge functions using
  the service role via `lib/supabase/admin.ts`.
- **Every status write** is preceded by `setActor(db, "<actor>")` so the
  transition audit (`booking_transitions`) knows who acted via which channel.
  Actors: `member | owner:telegram | office:airtable | system:stripe | system:expiry | system`.
- **Status machine:** the legal graph lives in `0002_bookings.sql`. New
  transitions = migration + PRD R3 update, never a trigger bypass.
- **Migrations are append-only.** New file, sequential prefix. Never edit shipped SQL.
- **Time:** timestamptz/UTC in the database, `America/New_York` applied only at
  render (UI, email, bot). No `new Date()` string math near booking windows.
- **AI:** the triage contract is `lib/triage/schema.ts` + `prompts/triage/v1.md`,
  kept in lockstep. Prompt changes = new versioned file + `PROMPT_VERSION` bump
  (old versions are immutable once referenced by `ai_events`). Behavior changes
  require golden-set green: ≥90% overall, 100% containment.
- **Airtable:** projection only. Write-back whitelist (`visit_notes`,
  `mark_completed`) is in the edge function; expanding it = ADR-01 amendment.
- **Secrets:** never in code, never `NEXT_PUBLIC_` unless truly public, gitleaks
  runs in CI over full history. `.env.example` documents every variable.
- **Commits:** conventional commits; PRs-to-self with the template filled in,
  including the traceability line (R# / ADR-## / C#).
- **Scope:** new ideas → `docs/parking-lot.md`, not the sprint. Cuts follow the
  ordered list in `docs/04-build-plan.md` §3 and get logged in `docs/log.md`.
- **Daily:** one paragraph in `docs/log.md` — decisions, surprises, what was
  deliberately not done.

## Definition of done (per task)

Typecheck + lint + tests green locally; acceptance criteria for the touched
R# checked or consciously deferred with a log entry; no TODO(D#) markers
removed without their work actually done; `docs/log.md` updated.

## Current state

Day-0 scaffold. Load-bearing and complete: migrations 0001–0006, seed,
triage contract + golden set, CI, edge-function security skeletons.
Marked TODO(D#): edge-fn business wiring, RLS suite implementation, chaos
script, n8n exports, member UI (arrives Day 3 via the fenced Lovable
scaffold — ADR-05: presentation only, data access replaced with typed server
actions before merge). Dependency versions in package.json were written
offline — Day 1 starts with `npm install`, reconcile, commit the lockfile.
