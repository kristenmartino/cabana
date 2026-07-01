# Cabana — Build Plan

10 working days, three gates, one engineer. This doc is also the scope-vs-timing contract: the cut list is ordered before the build starts, so a slip triggers a pre-made decision instead of a mid-build panic.

---

## 1. Tool assignments (deliberate, and part of the deliverable)

The target role tests fluency across a specific toolset. Each tool is assigned where it's genuinely strongest, and the repo/commits make each assignment verifiable — the tooling story is *shown*, not claimed.

| Tool | Assignment | Evidence it leaves behind |
|---|---|---|
| **Claude Code** | Primary build surface: schema/migrations, RLS, edge functions, server actions, tests, chaos scripts, n8n workflow JSON | Commit history; `CLAUDE.md` with project conventions checked into the repo |
| **Cursor** | Frontend refactor of the Lovable scaffold (Days 3–4) and component iteration | Refactor PR with before/after; scaffold-import and hand-edit as separate commits |
| **Lovable** | Member-facing UI scaffold only, per ADR-05 fence | The import commit vs. refactor diff *is* the "hand-edit without breaking it" proof |
| **Replit** | Day-1 single-sitting spike: Telegram bot hello-world (webhook, secret token, allowlist, inline buttons) | Repl link in README; spike learnings folded into the real edge function |
| **Vercel** | Next.js deploy, middleware, env config; deliberately break one build and debug from the log | A `docs/notes/vercel-build-debug.md` postmortem of the induced failure |
| **Supabase** | Auth, RLS, edge functions, migrations — the schema you'd be proud to inherit | `supabase/migrations/`, RLS test suite in CI |
| **n8n** | Outbox consumption, branching, retries, error workflow, reconciliation cron | Exported workflow JSON versioned in `ops/n8n/` |
| **Airtable** | Owner console: base, linked records, views, automations, Interface | Loom segment; one-page Marie guide in `docs/` |
| **Telegram Bot API** | Owner front door end-to-end | Live demo; idempotent callback tests |
| **GitHub** | Solo-committer discipline: conventional commits, PRs-to-self with descriptions, CI gates | The history itself |
| **Claude Desktop** | Separate 1-hour timed exercise (Day 10): "member assistant" from a system prompt + uploaded Sailfish context docs | Recorded, timestamped run + the system prompt in `docs/desktop-assistant/` |

---

## 2. Ten days, three gates

**Rhythm:** each day ends with a deployed state and a one-paragraph build log (`docs/log.md`) — decisions, surprises, cuts. The log doubles as interview material.

### Days 1–2 → **Gate 1: Walking skeleton**
- **D1 am:** Repo, CI (typecheck/lint/test/secret-scan), Supabase project, migrations 001–004 (core tables, status-transition trigger, exclusion constraint, outbox), seed script v0. Resolve OQ1–OQ3 (Airtable tier, n8n hosting, Supabase limits) *before* anything depends on them.
- **D1 pm:** **Replit spike** — Telegram bot with webhook, secret token, allowlist, one inline button, in a single sitting.
- **D2:** Wire the spine with hardcoded data: script inserts a booking → outbox → n8n (nudge + sweep) → Airtable row appears + Telegram ping with working Approve button → transition recorded.
- **Gate 1 (end D2):** one command demonstrates DB → n8n → Airtable + Telegram, with the outbox surviving an n8n restart mid-flow. *If Gate 1 slips a day, cut C1 immediately (see cut list).*

### Days 3–6 → **Gate 2: Money path proven**
- **D3:** Lovable scaffold of member portal (pages: sign-in, home, request, request-status) → import commit → **Cursor** refactor pass per ADR-05 checklist.
- **D4:** Supabase magic-link auth, middleware gating, RLS policies + the three-fixture RLS test suite, member views on live data.
- **D5:** Intake flow: server action → Haiku triage (zod, confidence gate, timeout fallback) → status routing → `ai_events`. Golden set (20 cases incl. injections) wired into CI.
- **D6:** Stripe Checkout + `stripe-webhook` edge fn: signature verification, `stripe_events` idempotency, out-of-order handling, "confirming…" UI state, 24h expiry job in n8n. Replay/duplicate/out-of-order tests.
- **Gate 2 (end D6):** a stranger with the seed data can submit "pump grinding, water green," pay a test-mode deposit, and watch the booking reach `scheduled` — with the replay test proving it can't double-book or double-charge state. *Slip here → cut C2, then C3.*

### Days 7–10 → **Gate 3: Chaos-clean & demo-ready**
- **D7:** Full n8n build-out: branching by event topic, retries/backoff, error workflow → Telegram alert + dead-letter, member email, nightly reconciliation, health-check poller.
- **D8:** Airtable console: base, linked records, five views, Interface page, write-back automation → edge fn (whitelist). Telegram commands `/today`, `/week`, `/cancel`, `/brief`. Marie's one-page guide.
- **D9:** **Chaos day.** Run the scripted run (50 bookings; kill n8n mid-stream; inject duplicate webhooks and Airtable failures; replay Stripe events). Fix until M3 holds. Then DST fixture test, mobile pass on the portal, copy pass on every member-facing string (the "no" message gets real attention — see PRD edge-case story).
- **D10:** README (diagram, quickstart, failure-modes section, cost notes), 90-second Loom, induced-Vercel-failure postmortem note, **Claude Desktop member-assistant timed hour**, seed-data polish, tag `v1.0`.
- **Gate 3 (end D10):** the reviewer path in §5 works start to finish.

---

## 3. Scope vs. timing: the cut order (decided now, not under pressure)

If the schedule slips, cut in this order — each cut names what's preserved:

- **C1. `/brief` AI command** → cut first; pure garnish. (Preserves: all P0 behavior.)
- **C2. Airtable write-back** → console becomes read-only + Telegram-driven changes; ADR-01 already blessed this fallback. (Preserves: office visibility, source-of-truth integrity.)
- **C3. Member email notifications** → Telegram + portal status only. (Preserves: zero-lost-intake; members can still self-serve status.)
- **C4. `/cancel` via bot** → cancellations through Airtable/portal only. (Preserves: approve flow, the 1-tap story.)
- **C5. Photo upload on intake** → text only. (Preserves: triage quality on the golden set.)

**Never cut, regardless of slip:** RLS + its test suite; webhook signature verification + idempotency; the transactional outbox + dead-letter + alerting; the AI fallback path; the chaos test. If the timeline threatens these, the timeline moves — these five are what make the build worth showing.

**Scope additions:** any new idea goes to `docs/parking-lot.md`. Nothing enters v1 without removing something of equal size. (The parking lot already holds: tech day sheets, reschedule self-service, QuickBooks read sync, photo→Airtable.)

---

## 4. The bar: what separates this build from an amateur version

Written as review criteria — also usable verbatim as interview material for "where do these systems break in production?"

| Area | Amateur tell | The bar here |
|---|---|---|
| Payments | Marks paid on the success redirect; processes webhooks without signature or idempotency checks | Webhook-authoritative state; `stripe_events` ledger; replay/out-of-order tests green (R4) |
| Pipelines | DB webhook fire-and-forget; failures vanish; "it's been quiet" means nothing | Transactional outbox; nudge for latency + sweep for guarantee; DLQ + alert; nightly reconciliation — quiet is *enforced* to mean healthy (ADR-02) |
| Supabase | Service-role key in the client "temporarily"; RLS "later"; UI-level filtering as security | RLS on day one, default-deny, tested with adversarial JWT fixtures in CI |
| Airtable | Second source of truth; freeform two-way sync; drift discovered by the customer | Projection + 2-field whitelist + audit + reconciliation (ADR-01) |
| Telegram | Polling in prod; no sender auth — anyone who finds the bot can command the business | Webhook + secret token + allowlist + idempotent callbacks (ADR-07) |
| AI | Big model, broad authority, no fallback, no evals; guardrails = a paragraph in the prompt | Small model, narrow contract, structural inability to commit, golden set with injections in CI, every call logged with cost (ADR-08) |
| Scheduling | Uniqueness enforced in app code; timezone handled by vibes | DB exclusion constraint under concurrency test; UTC storage with a DST fixture (R3) |
| Scaffold tools | Lovable output shipped as-is, architecture erodes from day 3 | Fenced scaffold + refactor checklist; the diff is the proof of hand-editing (ADR-05) |
| Scope | Migrates QuickBooks billing "while we're in there"; project dies in month two | Load-bearing scope cut made in the discovery room and written down (ADR-06, NG1) |
| Discovery | "What features do you want?" → wishlist → build → abandonment | Five questions that map process, money, and adoption risk; requirements trace to answers (00-discovery) |
| Repo | No README path to running it; secrets in history; tests cover the easy 80% | ≤10-min quickstart; secret scan in CI; tests concentrated on failure modes (R8) |

---

## 5. What the hiring manager sees (reviewer's first ten minutes)

Design the reviewer's path deliberately:

1. **README, 30 seconds:** what it is, live demo link, architecture diagram, 90-second Loom.
2. **Minute 2:** "Failure modes & production notes" section — the table from `02-architecture.md` §6, front and center. This is the section that answers "have they run things in production," and almost no portfolio repo has it.
3. **Minute 4:** `docs/` — discovery → PRD → ADRs → this plan. The point lands: the build was *scoped like a professional engagement*, not accreted.
4. **Minute 6:** commit history — conventional commits, PRs-to-self, the Lovable import/refactor pair, the chaos-day fixes.
5. **Minute 8:** CI — green, with the golden set and RLS suite visible as first-class jobs.
6. **Minute 10:** they run the seed + demo, or watch the Loom: request → triage → deposit → Telegram approve → Airtable → member status, then the chaos script.

**Demo script (7 minutes, also the Loom outline):**
1. Member submits a messy free-text repair request on a phone (30s)
2. Show the triage record + drafted acknowledgment; show a low-confidence message routing to review instead (60s)
3. Pay the deposit (test card); point at the "confirming…" state, then the webhook-driven flip (60s)
4. Dana's Telegram ping → 1-tap Approve → member email + Airtable update (60s)
5. Marie's Interface: the week, mark a job completed, watch it round-trip (60s)
6. Kill n8n, submit a booking, restart — nothing lost; show the DLQ/alert path with a forced failure (90s)
7. `/brief`, then the README failure-modes section as the close (60s)

---

## 6. Timeline risks & responses

| Risk | Signal | Response |
|---|---|---|
| Day-1 vendor surprises (OQ1–OQ3) | Airtable Interfaces or n8n hosting doesn't fit assumptions | Pre-cleared fallbacks: Airtable views-only (defer Interface to v1.5) / self-host n8n on Railway. Decide by end of D1, log in ADR amendment |
| Telegram webhook friction in dev | Tunnel instability burning hours | Spike already de-risked it on Replit D1; worst case, dev on polling, prod on webhook (prod behavior is what's asserted in tests) |
| Chaos day finds a design flaw, not a bug | D9 running long | That's the day existing for. Gate 3 slips before the never-cut list bends; C-cuts fund the fix |
| Golden-set stubbornness | Triage < 90% after prompt iteration | Tighten the confidence gate (more `needs_review`) rather than chase accuracy — D8 explicitly prefers human review over model confidence |
| Perfectionism (the honest one) | Polishing UI past Gate 2 while R5 is unproven | Gates are ordered by risk, not by demo appeal; the log's daily "what I didn't do" line keeps it honest |

---

## 7. Definition of done

- [ ] All R1–R8 acceptance criteria checked, or the cut is recorded in `docs/log.md` with its C-number.
- [ ] M1–M6 verified, with the chaos-run output committed as evidence.
- [ ] Reviewer path (§5) walked start-to-finish by someone who isn't the author — or, failing a volunteer, on a clean machine with a stopwatch.
- [ ] Claude Desktop member-assistant: built inside the hour, recorded, system prompt committed.
- [ ] Tagged `v1.0`; parking lot and v1.5 list current; README cost-notes section reflects the actual services chosen in OQ1–OQ3.
