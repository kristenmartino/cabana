# Cabana — Execution Plan: start of Day 2 → v1.0

**Written:** 2026-07-01 (start of Day 2). **Purpose:** reconcile where the repo
*actually* is (per `log.md` and the code) with the remaining gates in
`04-build-plan.md`, and turn that into an executable design/build/test/deploy
sequence. This doc relitigates nothing: `04-build-plan.md` stays the
scope-vs-timing contract (gates §2, cut order §3, risk responses §6, DoD §7);
the ADRs in `03-decisions.md` stand. Requirements and acceptance criteria are
`01-prd.md` R1–R8 / M1–M6.

## Where the project actually is (verified in-repo, not assumed)

- On `main`, clean tree, 4 conventional commits, pushed. **Day 0 + Day 1 are
  done** (`log.md` has an empty "Day 2 —" header).
- **Genuinely complete and load-bearing:** migrations 0001–0007 (full schema,
  13-edge status machine, `no_tech_overlap` exclusion constraint, transactional
  outbox + emit triggers with acyclic `dedupe_key`, default-deny RLS on all 16
  tables + `access_notes` column grant, `set_actor`); seed covering all 8
  booking statuses; the whole AI triage subsystem (`lib/triage/schema.ts` +
  `index.ts` with 2s timeout and structural fallback→`needs_review`,
  `prompts/triage/v1.md`, 20-case golden set with 8 containment cases, CI
  runner enforcing ≥90% / 100% containment); edge-function security patterns
  (Stripe signature verification + `stripe_events` ledger, Telegram secret
  token + allowlist, write-back whitelist); CI (typecheck/lint/test/gitleaks/golden).
- **Stubs (all seven TODO sites located):**
  `supabase/functions/stripe-webhook/index.ts:63-76` (D6 handlers),
  `supabase/functions/telegram-webhook/index.ts:70-80` (D8 callbacks + commands),
  `supabase/functions/airtable-writeback/index.ts:55-61` (D8 apply logic),
  `tests/rls/rls.test.ts:20-38` (15 `it.todo` — **passes vacuously today**),
  `.github/workflows/ci.yml:53-55` (D4 db job), `scripts/chaos/run.ts` (D9,
  exits 1), `ops/n8n/workflows/` (empty; 5 workflows spec'd in its README).
- **Carried-over Day-1 debt:** OQ1–OQ3 (Airtable tier, n8n hosting, Supabase
  limits) were "blocking, Day 1" and remain unresolved; the Replit Telegram
  spike has no log evidence; the golden CI job silently **skips** without an
  `ANTHROPIC_API_KEY` repo secret, so M5 currently has no evidence.

**Environments (fixed for the whole plan):** local = `supabase start` +
`stripe listen` + tunnel/polling for Telegram, env in `.env.local`. Cloud
(demo = prod) = Vercel + Supabase cloud (DB + 3 edge fns) + n8n host (per OQ2)
+ Stripe test mode + Telegram prod webhook + Airtable. Secrets: Vercel env
vars / `supabase secrets set` / n8n credential store (never inside exported
JSON) / GitHub Actions secret for golden. **Rollback primitives everywhere:**
migrations append-only (forward-fix, precedent 0007); Vercel instant redeploy;
edge fns redeploy prior version; n8n re-import prior JSON; Stripe self-heals
via ~72h retries + idempotency ledger; n8n outages self-heal via the outbox
sweep.

---

## Phase 0 — Unblock: OQ decisions + provisioning (Day 2 am, timebox ≤2h) [DESIGN]

**Objective:** retire overdue OQ1–OQ3 and stand up every external account so
nothing downstream waits on a vendor.

1. **OQ2 first (longest dependency tail):** n8n hosting. One constraint the
   docs imply but don't state: **the chaos test requires killing n8n
   mid-stream; Railway self-host gives a kill switch, n8n Cloud may not** — so
   the pre-cleared §6 fallback (Railway) is the default unless cloud offers
   equivalent stop/start control.
2. **OQ1:** Airtable tier for Interfaces + automation volume. Fallback
   pre-cleared: views-only console, Interface → v1.5.
3. **OQ3:** Supabase free-tier limits vs. chaos volume, **including
   free-project auto-pause** (a paused project kills the reviewer demo link,
   M1) — mitigate via the D7 health-check keep-warm or budget Pro in README
   cost notes.
4. Provision in parallel: Supabase cloud project (`supabase link` + `db push`
   0001–0008 + seed, deploy the 3 skeleton fns), Railway/n8n, Airtable base
   skeleton, BotFather bot, Stripe test account, Resend. Record secrets per
   `.env.example`.
5. **Add `ANTHROPIC_API_KEY` to GitHub Actions secrets** (5 min) — golden job
   must *pass*, not skip.

**Exit:** decisions logged as ADR amendment in `03-decisions.md` + dated
`log.md` Day 2 entry (hard stop: end of D2 morning — the fallback *is* the
decision if the timebox blows). `supabase migration list` shows 0008 on cloud;
next CI push shows golden executing.

## Phase 1 — Gate 1: walking skeleton spine (Day 2) [BUILD + DEPLOY]

**Objective (build-plan §2 D2):** insert booking → outbox → n8n (nudge +
sweep) → Airtable row + Telegram ping with a working Approve button →
transition recorded, with hardcoded/seed data.

1. `outbox-consumer.json` v0 on n8n: DB-webhook nudge + 60s cron sweep, dedupe
   on `dedupe_key`, two branches only (Airtable upsert, Telegram ping),
   `processed_at` / attempts++ / dead-letter. Export to `ops/n8n/workflows/`
   and commit (instance never drifts ahead of repo).
2. **Minimal Approve slice** in `supabase/functions/telegram-webhook/index.ts:70`
   (planned partial pull-forward of TODO(D8)): callback →
   `transition_booking(id, 'confirmed', 'owner:telegram')` (0008 — one
   transaction; a bare `set_actor` rpc loses the actor across PostgREST
   requests) → `answerCallbackQuery`; handle P0001 on duplicate tap as
   "already handled".
   Full command router stays D8.
3. Telegram `setWebhook` to the deployed edge fn (stable HTTPS — avoids
   dev-tunnel friction); seed `telegram_chats` with the real owner chat id.
4. Airtable Bookings table v0 + n8n upsert keyed by booking id.
5. Spine driver (new `scripts/spine-demo.ts` or documented psql insert).
6. Interleave during provisioning waits: the time-boxed **Replit spike** (≤1h;
   now a tool-assignment deliverable — Repl link in README — since the edge fn
   already carries the security patterns), or consciously defer with a log entry.

**Test gate (exit = Gate 1):** one-command spine demo; **restart-survival**
(kill n8n mid-stream, restart → sweep drains, exactly one Airtable row);
duplicate-tap idempotency; typecheck/lint/test green. **If Gate 1 slips past
D2 → cut C1 (`/brief`) immediately, log it** — Phase 0 eats the morning, so
this trigger is pre-armed.
**Deploys:** Supabase cloud (schema, seed, telegram-webhook + secrets), n8n
(1 workflow + DB webhook registered), Airtable v0, Telegram registered.
Nothing on Vercel yet.

## Phase 2 — Member surface + RLS suite becomes real (Days 3–4) [BUILD + TEST]

**Objective:** R1 portal with magic-link auth — with the RLS adversarial suite
implemented and gating CI *before* live data touches the UI (R1 AC #2 names
the suite, not UI filtering, as the verification mechanism).

- **D3 (ADR-05 fence, two-commit discipline):** Lovable scaffold (sign-in /
  home / request / request-status) → separate **import commit** → Cursor
  refactor pass (typed props, server actions only, tokens, dead code, a11y)
  as distinct commits — the diff is the deliverable. **Sequencing rule:
  scaffold runs on mock data only until D4's RLS suite is green.** Vercel
  first deploy + do the **induced build-break + postmortem draft**
  (`docs/notes/vercel-build-debug.md`) here while it's cheap, on a preview
  deployment.
- **D4, in order:** (1) implement `tests/rls/rls.test.ts` — replace all 15
  `it.todo` with the three-fixture matrix (member A / member B / service
  role): isolation incl. join paths, service-role-only tables invisible,
  write lockdown, `access_notes` column grant + stamp trigger, double-booking
  race, illegal transition P0001, transition audit, outbox dedupe (DST case
  may stay stubbed until Phase 5); (2) add the CI `db` job at
  `.github/workflows/ci.yml:53` (setup-cli → start → db reset → test:rls),
  **in the same PR as the implemented suite, with a zero-tests-executed
  failure guard** — it must never gate while vacuous; (3) only then:
  magic-link auth on cloud + local, non-member polite dead end, member views
  on live data, access-notes edit path.

**Test gate:** RLS suite green locally + in CI; golden job green (first real
run); manual auth walk on the Vercel deployment; R1 ACs on a phone.
**Deploys:** Vercel (portal + auth), Supabase auth config (magic-link
template, redirect URLs).

## Phase 3 — Gate 2: money path proven (Days 5–6) [BUILD + TEST + DEPLOY]

**Objective:** stranger + seed data submits "pump grinding, water green," pays
a test deposit, watches the booking reach `scheduled`; replay tests prove no
double-book/double-charge.

- **D5 intake (R2):** new server action (`app/.../actions.ts`): insert
  `requested` + outbox in one transaction → `triageIntake()` (already
  complete — the action must **not** add a competing try/catch around its
  structural fallback) → confidence-gated routing (≥0.8 → `awaiting_deposit`;
  else `needs_review`) → `ai_events` row → drafted ack or holding reply;
  `transitionBooking` for every status write (0008 — never the deprecated
  `setActor` + update two-step). **Fallback drill:** remove the API key
  locally, verify the member flow still completes with the holding reply
  (never-cut #4).
- **D6 Stripe (R4):** Checkout session in the server action ($75 test mode);
  wire TODO(D6) in `supabase/functions/stripe-webhook/index.ts:63`:
  `completed` → payment `paid` + `awaiting_deposit→scheduled` (actor
  `system:stripe`); `expired` → payment `expired` (booking expiry stays owned
  by the n8n job — single owner). "Confirming…" success-redirect state
  (redirect is cosmetic). `deposit-expiry.json` on n8n — **note: this is a
  Gate-2 dependency (R4 AC), not D7 work**; cheap since the instance exists
  since D2.
- **New webhook tests (no file exists yet)** — `tests/webhooks/stripe.test.ts`:
  replay N× → exactly one payment row + one transition; out-of-order/late
  events reconcile; unsigned/invalid rejected + logged. Author against
  fixtures before the fn wiring is done (red→green).

**Test gate (exit = Gate 2):** golden green in CI (M5); webhook
replay/out-of-order/signature tests green; race test green; end-to-end with
test card 4242 on Vercel; fallback drill passes. Golden <90% → **tighten the
confidence gate, don't chase accuracy** (§6 row 4); prompt changes =
`prompts/triage/v2.md` + `PROMPT_VERSION` bump, never edit v1. **Slip → cut
C2, then C3, logged.**
**Deploys:** stripe-webhook to cloud; **register the endpoint in the Stripe
test dashboard** (`checkout.session.completed`/`expired`) — **the dashboard
signing secret differs from the `stripe listen` CLI secret**; set the
dashboard one via `supabase secrets set`, keep the CLI one in `.env.local`,
and verify with `stripe trigger` against cloud (the classic silent-400 trap).
deposit-expiry live; Vercel redeploy with intake + pay flow.

## Phase 4 — Full pipeline + both consoles (Days 7–8) [BUILD]

**Objective:** R5 delivery guarantees complete, R6 Airtable console +
write-back, R7 full bot. This phase holds cut candidates C1–C4.

- **D7 n8n build-out** (all exported to `ops/n8n/workflows/`): outbox-consumer
  full (branch by topic → Airtable / Telegram / Resend email; backoff; 5
  attempts → dead-letter + Telegram alert), `error-workflow.json` as the
  instance-level error workflow (the alarm on the alarm),
  `reconciliation.json` (nightly one-liner to Telegram), `health-check.json`
  (q5min against a new `app/api/health/route.ts`: DB reachable, outbox depth,
  oldest-unprocessed age — doubles as the OQ3 keep-warm). Rule: every branch
  ends in success-mark or dead-letter; no silent ends.
- **D8 Airtable (R6):** linked records, five views, Interface (or views-only
  per OQ1 fallback), write-back automation → wire TODO(D8) in
  `supabase/functions/airtable-writeback/index.ts:55`
  (`transition_booking(id, 'completed', 'office:airtable')` for
  `mark_completed`, plain update for `visit_notes`, P0001 reported back,
  `sync_log` row; whitelist does not grow — ADR-01). Marie
  one-page guide in `docs/`.
- **D8 Telegram (R7):** command router TODO(D8) in
  `supabase/functions/telegram-webhook/index.ts:76-80` (`/today`, `/week`,
  `/cancel`, `/brief` — query-grounded, "nothing scheduled" over guessing);
  Needs-info button.

**Test gate:** scripted drills logged in `log.md` (they become chaos steps):
invalidate the Airtable token 60s → retries or dead-letter + alert ≤2 min,
never silence; reconciliation posts "n bookings, n synced, 0 drift";
non-whitelisted Airtable edit snaps back + `sync_log`; unauthorized Telegram
chat refused/logged/alerts; double-tap idempotent.
**Cut valve if slipping:** C1 `/brief` → C2 write-back (console read-only,
ADR-01-blessed) → C3 member email → C4 `/cancel`; each cut = log entry with
its C-number. **Never cut:** RLS+suite, webhook verification+idempotency,
outbox+DLQ+alerting, AI fallback, chaos test.

## Phase 5 — Gate 3a: chaos day (Day 9) [TEST]

**Objective:** M3 with committed evidence: 50 bookings, n8n killed mid-stream
(Railway stop — the OQ2 decision pays off), duplicate webhooks, forced
Airtable failures, Stripe replays → 0 lost, 0 duplicated.

- Implement `scripts/chaos/run.ts` to its README contract: `--phase inject`
  (50 bookings **via the real server-action path**, randomized 0–5s,
  `chaos_marker`) and `--phase verify` (4 assertions: one Airtable record per
  booking; every outbox row `processed_at` OR dead-lettered with alert — no
  third state; email count == qualifying transitions; every paid payment joins
  `stripe_events`). Exit non-zero on any miss; write
  `scripts/chaos/runs/<date>.log` and commit it (M3 evidence).
- Instrument inject for **M2** (submit → Telegram-ping p95 ≤ 60s) in the same log.
- Finalize the DST fixture (Nov 2026 boundary — R3 AC #3); mobile pass; copy
  pass on member-facing strings (the out-of-area "no" gets real attention).
- **If chaos finds a design flaw, not a bug:** that's the day existing for —
  Gate 3 slips before the never-cut list bends; C-cuts fund the fix (§6 row 3).

## Phase 6 — Gate 3b: ship v1.0 (Day 10) [DEPLOY + SHIP]

README (diagram, quickstart, failure-modes table from `02-architecture.md` §6
front-and-center, cost notes reflecting the actual OQ choices, Repl link,
rotation runbook); 90s Loom per the §5 demo script; finalize the Vercel
postmortem note; Claude Desktop member-assistant **timed hour** →
`docs/desktop-assistant/`; seed polish; pin the final Vercel deployment;
spot-check n8n exports match the running instance; tag `v1.0`.

**M-evidence closeout:** M1 clone→running ≤10 min on a clean machine with a
stopwatch; M2/M3 chaos log committed; M4 one-tap approve in the Loom +
idempotency test; M5 link the green CI run (golden *passing*, not skipping);
M6 webhook tests + chaos assertion 4. Full CI green on the tag commit. DoD §7:
every box checked or the cut logged with its C-number.

---

## Critical path & parallelization

**Critical path:** OQ2 (n8n hosting) → n8n live → outbox-consumer v0 →
**Gate 1** → RLS suite + auth → intake action → stripe-webhook wiring +
webhook tests → **Gate 2** → full n8n → Airtable/Telegram → chaos →
**Gate 3**/v1.0. Chaos transitively depends on everything; the RLS CI job
depends only on Phase 2 and gates every later merge.
**Interleavable (solo = interleave, not simultaneous):** GitHub secret
(immediately); Replit spike (D2 waits); webhook-test authoring before fn
wiring (D6); D7 n8n vs. D8 Airtable base; README/failure-modes accreting daily
instead of big-bang D10.

## Skeletons that must become real before they may gate anything

1. `tests/rls/rls.test.ts` — 15 `it.todo`s, green-but-vacuous; real by end of
   D4, same PR as the CI db job, with a zero-tests guard.
2. `.github/workflows/ci.yml` db job — until it exists, RLS is untested on
   every push despite being never-cut #1.
3. Stripe replay/out-of-order tests — no file exists; Gate 2 is not passable
   without them.
4. `scripts/chaos/run.ts` — the M3 evidence generator.
5. Golden CI job — real but skips without the repo secret; M5 requires a pass.

## Top risks (pre-made responses, from build-plan §6)

1. **OQ1–OQ3 a day late, stacked on the D2 spine** → fallbacks are pre-cleared
   (views-only Airtable / Railway); hard deadline end of D2 morning; the
   fallback *is* the decision.
2. **Gate 1 slips (double-loaded Day 2)** → cut C1 immediately; compress the
   spike; spine completes before any D3 Lovable work.
3. **Telegram webhook friction** (spike never happened) → deploy the fn to
   cloud for a stable URL; dev on polling if needed — tests assert prod
   behavior only.
4. **Golden set <90% once CI actually runs it** → tighten the confidence gate,
   don't chase accuracy; containment stays 100% non-negotiable.
5. **Chaos finds a design flaw** → Gate 3 slips before the never-cut list
   bends; C-cuts fund the fix.

## Verification of this plan end-to-end

Each phase carries its own test gate above; the plan as a whole is verified by
the three gates (walking-skeleton restart-survival demo; Gate-2 stranger
walkthrough + replay tests; chaos verify green) plus the M1–M6 evidence
closeout in Phase 6 — all with committed artifacts (chaos run log, CI runs,
Loom), per the DoD in build-plan §7.
