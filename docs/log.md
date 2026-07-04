# Build log

One paragraph per day: decisions, surprises, cuts. Doubles as interview
material — "walk me through the build" is answered here.

## Day 0 — scaffold
Repo scaffolded from the spec package (docs/00–04). Complete and load-bearing:
migrations 0001–0006 (schema, status machine, exclusion constraint, outbox +
emit triggers, RLS + write lockdown, set_actor), seed world (every booking
status represented), triage contract (prompt v1 + zod schema + 20-case golden
set + CI runner), CI (typecheck/lint/test/gitleaks/golden), edge-function
skeletons with the security patterns in place (Stripe signature + idempotency
ledger, Telegram secret token + allowlist, write-back whitelist). Stubs marked
TODO(D#): edge-fn business wiring, RLS suite implementation, chaos script,
n8n workflow exports. Day 1 first hour: `npm install` and reconcile dependency
versions (scaffold versions are starting points, generated offline), commit
the lockfile, then resolve OQ1–OQ3 before anything depends on them.

## Day 1 — toolchain + local stack
`npm install` reconciled offline scaffold versions (Next 15.5, React 19, @supabase/ssr
0.6); lockfile committed. Typed `SetAllCookies` in SSR cookie handlers so strict
typecheck passes; added `.eslintrc.json` (next/core-web-vitals + next/typescript) so
`npm run lint` is non-interactive. `supabase init` + `supabase start` + `db reset`
green after Docker Desktop came up. Seed exposed a bug in 0002: BEFORE INSERT logged
to `booking_transitions` before the parent row existed — fixed in 0007 (append-only).
Verified @supabase/ssr patterns match current docs (async `cookies()`, getAll/setAll).
Did not: install global Supabase CLI (using `npx`), resolve OQ1–OQ3, wire edge fns.

## Day 2 —
Opened the day by reconciling actual repo state against the build plan and
writing `05-execution-plan.md`: phased design/build/test/deploy sequence from
here to v1.0, honoring the gates and cut order in 04. Carried-over debt named
explicitly: OQ1–OQ3 still open (Phase 0, timeboxed ≤2h, Railway default for
OQ2 because chaos needs an n8n kill switch), Replit spike unlogged, golden CI
job silently skipping without the `ANTHROPIC_API_KEY` repo secret. Flagged
that `tests/rls/rls.test.ts` passes vacuously (15 `it.todo`) — it must not
gate anything until implemented (D4, same PR as the CI db job).

Afternoon: found that actor attribution was broken for every status write via
supabase-js — `set_actor()` (0006) is transaction-local by design, but
PostgREST wraps each HTTP request in its own transaction, so
`rpc('set_actor')` + `.update()` spans two transactions and the guard (0007)
audited everything as `system`. Fix: 0008 (append-only) adds
`transition_booking(booking_id, to_status, actor)` — set_config + UPDATE in
one transaction, actor allowlist enforced, service-role only; `admin.ts` now
exposes `transitionBooking()` and deprecates the two-step (`set_actor` stays
for single-transaction SQL contexts like seed and the pg-based tests). Pulled
D6 stripe-webhook wiring forward so the fix has a real consumer: `completed`
→ payment `paid` + `awaiting_deposit→scheduled` via the RPC (audited
`system:stripe`), `expired` → pending-only payment expiry; also made the
ledger reprocess duplicates whose prior attempt died mid-flight
(`processed_at` null) — the old early-ack would have orphaned the event.
CLAUDE.md convention + execution-plan D2/D5/D8 prescriptions updated so the
two-step pattern doesn't come back. Traces: R3/R4 / ADR-03, ADR-04.

Evening: made never-cut #1 and #2 real ahead of schedule. RLS adversarial
suite implemented (18 tests, fixtures Ken/Priya/service-role; pg direct
connection for single-transaction actor + DST assertions; keys read from
`supabase status` at runtime so nothing secret-shaped lands in git) and wired
into CI as the `db` job with a guard that fails on a vacuous (todo/skip-only)
run. Stripe webhook acceptance suite added (12 tests against the real served
function, fixtures signed locally — no Stripe account): signature, ledger
idempotency, died-mid-flight reprocess, unpaid-completion + async settlement,
out-of-order, stale-event. The suites caught three real infrastructure gaps on
day one: (a) current Supabase no longer auto-grants Data API table access —
service_role had zero CRUD, so *every* PostgREST call would have failed local
and cloud → 0009 makes the 0005 privilege model explicit (grants restrict
verbs, RLS restricts rows); (b) `revoke execute from anon, authenticated` on
the write RPCs was a no-op because EXECUTE goes to PUBLIC by default —
verified with has_function_privilege, closed in 0009, asserted by a suite
test; (c) no `[functions.*] verify_jwt = false` existed, so Stripe/Telegram/
Airtable could never have reached the webhook fns (deploys need
`--no-verify-jwt` to match). Hardened stripe-webhook per adversarial review:
`payment_status` guard on completed (async methods complete unpaid) +
`async_payment_succeeded/failed` handlers. An adversarial review pass also
closed RLS-suite blind spots (businesses/techs, memberships/plans reads, RPC
execute-denial). devDeps: pg (transaction-level tests), ws (Node 20 realtime
shim). Did not do: OQ1–OQ3 (still open — now the first item of Day 3) and all
of the Gate-1 spine (needs vendor accounts). Traces: R1/R3/R4/R8 / ADR-03.

Night: OQ1–OQ3 resolved and logged as ADR-09. OQ2 → Railway self-host: the
decisive fact (verified against current docs) is that n8n Cloud has no
instance stop/restart, and the Day-9 chaos run must kill n8n mid-stream.
OQ1 → Airtable Free: Interfaces now exist on every tier; one Interface + 100
automation runs/mo fits R6 at demo volume. OQ3 → Supabase cloud project
`cabana` (uuviebpmiwzjyabucheo, us-east-1) created in the existing paid org:
$10/mo buys away the free-tier 7-day auto-pause that would kill the reviewer
demo link (M1); cost recorded for the README notes. Cloud provisioning begun
the same sitting: migrations 0001–0009 + seed pushed via MCP, all three edge
functions deployed with gateway JWT verification off (they authenticate
callers themselves — ADR-03/07/01). Awaiting owner-side account steps:
BotFather token, Railway n8n, Airtable base, Stripe test keys, `gh secret
set ANTHROPIC_API_KEY`. Traces: R5/R6 shape unblocked / ADR-09.

## Day 2 (cont.) — Telegram live + Gate-1 spine authored
Owner-side accounts landed: GitHub `ANTHROPIC_API_KEY` secret (golden job now
gates instead of skipping), Supabase CLI linked, BotFather bot `@cabanaboy_bot`
with secrets set, Railway n8n up, Airtable base created. Telegram inbound path
proven live end-to-end on cloud: secret-token auth → allowlist → edge function
(the owner's chat_id, read via @userinfobot, is seeded into `telegram_chats`).
Two setup papercuts worth remembering: on zsh, `read -rs -p` isn't a prompt and
`read` inside a pasted block swallows the next line as input — so the bot token
landed empty and every Telegram call 404'd until the token was assigned inline;
and the webhook secret set via `$(openssl rand -hex 24)` was unrecoverable, so
it had to be regenerated to a known value for `setWebhook`.

Gate-1 spine authored via a fan-out+adversarial-verify workflow (contract pinned
up front: outbox payload shape, dedupe keys, `callback_data`, Airtable fields).
Artifacts: `ops/n8n/workflows/outbox-consumer.json` (webhook nudge + 60s sweep →
fetch unprocessed → per-row Airtable idempotent upsert + conditional Telegram
Approve keyboard → mark processed; attempts/dead-letter on failure), the
telegram-webhook Approve slice (redeployed to cloud, v6), `scripts/spine-demo.ts`,
`scripts/airtable-setup.sh`, and the Gate-1 runbook in `ops/n8n/README.md`.
The verify pass caught three n8n bugs of one class — nodes reading bare `$json`
immediately downstream of an HTTP Request node (whose output replaces the item
with the API response), which silently undefined-ed the Telegram body, the
mark-processed id, AND the whole dead-letter branch — fixed by referencing the
upstream Code nodes by name; plus a spine-demo window that collided with the
`no_tech_overlap` exclusion constraint on repeat runs (fixed: per-run window +
retry-on-23P01) and a cleanup FK-order bug (dead_letters before outbox).
Nudge wiring hit a real platform limit: `0010` read the URL from a GUC, but
Supabase forbids the project role from persisting a custom GUC (`alter
database/role … set app.* → 42501`), so `0011` (append-only) switched to a
service-role-only `app_config` table read by a SECURITY DEFINER trigger; URL
configured on cloud and the 8 seed outbox rows marked processed for a clean
first demo. Corrected the overstated double-tap comment in code + README (a
same-status re-tap is a guard no-op, not P0001; P0001 is only for genuinely
stale taps). Local `db reset` applies 0010+0011 cleanly (pg_net present; trigger
no-ops with no `app_config` URL), typecheck + RLS (18) + webhooks (12) all green.
Remaining owner-side for Gate 1: import the workflow, set 2 creds + 2 Railway env
vars, replace `__BASE_ID__`, run `airtable-setup.sh`, then `spine-demo`. Traces:
R5/R7 / ADR-02, ADR-07.

## Day 2 (cont.) — GATE 1 CLOSED (spine + durability proven live)
The walking skeleton is proven end-to-end on live cloud infra. Functional: a
booking write → outbox → n8n (nudge + sweep) → one Airtable row upserted +
Telegram ping with a working Approve button → owner tap → `transition_booking`
records `scheduled→confirmed` by `owner:telegram`. Durability (the real Gate-1
assertion): n8n stopped in Railway, 3 bookings queued in the outbox, n8n
restarted; the 60s sweep drained all 3 with NO nudge — exactly one Airtable row
each (idempotent upsert), zero lost, zero duplicated, zero dead-lettered.

Bringing n8n up cost a run of real setup gotchas, all now in the runbook:
Airtable base id was copied one char short (17→16); n8n import lives on the
canvas (paste JSON) not the list; Supabase PostgREST needs BOTH `apikey` and
`Authorization` so the 5 Supabase nodes use n8n Custom Auth, not Header Auth;
and two hard ones tied to Railway's ephemeral filesystem — `N8N_ENCRYPTION_KEY`
MUST be pinned (unset, n8n auto-generates it onto disk which Railway wipes on
every redeploy → "credentials could not be decrypted"; pinning it is also what
lets credentials survive the restart the durability test depends on), and
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (this instance blocks `$env` in nodes,
which the Build-actions `$env.OWNER_CHAT_ID` needs). Also fixed the enrich
parsing so `member_id`/`request_text` populate (n8n split PostgREST's single-row
array into a bare object the code didn't expect).

Best part: the restart test caught a REAL intermittent Railway→Telegram
`connect ETIMEDOUT` (Telegram itself reachable elsewhere) and the outbox handled
it exactly as designed — Airtable committed once, the Telegram leg failed and
retried per-row until every ping delivered (A/B on attempt 2, C on attempt 3),
never lost, never duplicated, never dead-lettered. A better durability proof
than a clean pass. If Railway↔Telegram proves persistently flaky, the D7
error-workflow (dead-letter after 5 + alert) is the backstop — silence never
means loss. Test data cleaned up; seed world + Airtable pristine. Traces:
R5/R7 / M2, M3 (partial) / ADR-02.

## Day 3 — Phase 2: member portal wired to live data (ADR-05 refactor)
The fenced Lovable scaffold is now hardened behind typed server actions + auth —
the "harden the AI scaffold" half of ADR-05. Generated the authoritative
Supabase types (lib/supabase/database.types.ts) as the mock→real contract, then:
magic-link sign-in (members-only: a service-role membership check gates the OTP,
non-members get a polite dead end, never an account — R1), an /auth/callback that
exchanges the PKCE code and links the auth user to the member row by email on
first sign-in, sign-out, and middleware that gates the whole portal to signed-in
members. A read layer (lib/portal/data.ts) maps the schema to the pages'
view-models via RLS-scoped reads (member isolation enforced at the DB, not in
app code) — reconciling Lovable's field names (summary→request_text,
gateCode/pets→access_notes, its tones→the real status enum→StatusPill
tone+label), computing next-service from plan.weekly_day in America/New_York.
Home + request/[id] became server components; access-notes editing (the one
browser-writable field, via the column grant + stamp trigger) and the intake
submission are server actions. Intake insert goes through a new atomic RPC
(0012 create_member_request) so it's audited as actor 'member' — same
transaction-local-actor reason as transition_booking (0008).

Verified live end-to-end on the local stack (dev on :3000, magic link pulled
from mailpit): middleware bounces unauthenticated → sign-in; Ken signs in via
the real PKCE magic link; the callback links his member row; the signed-in home
renders his ACTUAL seed data — "Hi Ken", next service "Tuesday, Jul 7" computed
from Weekly Essential, his awaiting_deposit heater request with the right pill,
history, and the editable access-notes card. The intake write path is verified
via create_member_request directly (inserts 'requested', audits 'member', emits
booking.created). One follow-up: the auth session dropped after several rapid
preview-browser prefetch navigations (a refresh-token-rotation interaction) — the
code follows the standard @supabase/ssr pattern and the reads worked, so this
reads as a headless-automation/prefetch artifact; confirm on the Vercel deploy
(production cookie handling + real browser) before calling it a bug. Import↔
refactor diff is the ADR-05 artifact. Traces: R1 / ADR-05.

## Day 3 (cont.) — Phase 2 CLOSED: verified in production, deployed, merged
Deployed the portal to Vercel (Git integration; repo root = app root) and settled
the flagged auth-session question in the environment that matters. First deploy
surfaced two real config gaps, both fixed: Vercel Deployment Protection was on
(blocks a public demo — disabled), and the cloud project's default Site URL was
localhost:3000 so magic links redirected there instead of /auth/callback (set
Site URL + redirect-URL wildcard to the Vercel domain). With that, the FULL flow
was verified by a human in a real browser on the production build: gate →
magic-link → /auth/callback links the member → signed-in home with real
RLS-scoped data → "Report a problem" → submit → lands on the live status page.
Crucially the session HELD through the write — so the earlier drop was a
headless-automation/prefetch artifact, not a bug. PR #2 merged to main (Phase 2
R1 done). Note: cloud member a1..01 was remapped to the tester's real email so
magic links reach a real inbox (cloud has no mailpit); revert or add a dedicated
member before a clean demo. Follow-up when the production URL becomes the demo
link: point the cloud Site URL at it. Next: Phase 3 / Gate 2 (intake → Haiku
triage → Stripe deposit) on a verified auth+intake foundation. Traces: R1 / ADR-05, M1.

## Day 3 (cont.) — Gate 2 CLOSED: money path proven live end-to-end
Phase 3 shipped and Gate 2 fell in the environment that matters — live in
production Supabase, one Vercel PR (#3, squash-merged). The full path is now
proven on real infrastructure: member submits a repair message → Haiku triage
(4430ms · 1017/161 tokens · 0.95 confidence · service_type=repair) → apply_triage
(0013, atomic actor 'system') → awaiting_deposit with a personalized ackDraft
("Thanks for letting us know, Kristen. A grinding noise and priming issue
usually point to something we can help with quickly. Dana will text…") → coral
Pay button opens a hosted Stripe Checkout Session for $75 (payments row
inserted with the session id BEFORE the redirect) → 4242 4242 4242 4242 →
webhook signature-verified, ledgered idempotent, payments flipped to paid,
transition_booking(system:stripe) advanced awaiting_deposit → scheduled →
"Deposit received" rendered. Every never-cut invariant held live, and #4 was
proven in BOTH directions today: an earlier run with ANTHROPIC_API_KEY missing
on Vercel wrote validation_failed (3ms, 0 tokens) and routed to needs_review
with the generic ack — never threw into the member flow. Adversarial verify on
the branch caught two real defects that would have broken Gate 2 shipped: a
redirect() call inside a try/catch that swallowed NEXT_REDIRECT (fixed to move
outside), and a discarded payments.insert error that would have redirected the
member to Stripe with nothing for the webhook to flip (never-cut #2 breach —
fixed to throw on payErr). Surprises worth banking: (1) the stripe-webhook
edge function needs STRIPE_SECRET_KEY too, not just STRIPE_WEBHOOK_SECRET —
Vercel env vars don't reach Supabase's edge runtime, cost ~30 min at the end;
(2) Resend "Delivered" does NOT mean "reached the mailbox" — Microsoft 365
tenant quarantine silently held every magic-link email until we allowlisted
mail.kristenmartino.ai, half an hour lost; (3) Supabase's Redirect-URL
wildcards do NOT match across '-' segments in preview subdomains the way
naive intuition suggests, so per-branch entries are safer than a global
wildcard; (4) Vercel env vars are read at build time, not at request time —
adding ANTHROPIC_API_KEY to an already-deployed preview did nothing until the
next push forced a rebuild; (5) Haiku (index.ts wrote &apos; inside a JSX
string expression, which React renders literally as text — fixed as follow-up
55d7c20). Deliberately deferred: (a) the "Confirming your payment…" state's
copy overpromises — the DB updates from the webhook but the browser tab
doesn't poll or subscribe, so it requires a manual refresh; small follow-up
task (add a 3s router.refresh() while paid=1 && awaiting_deposit); (b) two
orphan test bookings on cloud (9051be1f stuck at 'requested' from a
pre-merge prod attempt, 18d7914c 'scheduled' from this success); left in
place — the second is a nice "here's a real paid booking" demo artifact,
and the first is a natural example of a member submitting before the code
was there; cleanup optional before a live demo; (c) golden case
g10_price_fishing flaky on Haiku non-determinism, not blocking (Phase 3
didn't touch the prompt or schema); (d) secret-scan CI job broken by a
gitleaks-action GitHub token-permission issue that predates this PR — CI
hygiene follow-up. Prod redeploy of main will land shortly; the demo URL
(cabana-git-main-…vercel.app) is now the Phase 3 money path. Traces: R2, R4 /
ADR-03, ADR-08 / M1, M2, C-money-path.

## Day 4 — Slice 1 + Slice 2 shipped; R4 AC #5 closed, R5 delivery guarantees teethed
Two-slice night through the multi-agent orchestration harness. Slice 1 (PR #4, 4
files): expire_stale_deposits() SECURITY DEFINER RPC (0014) that sweeps
awaiting_deposit bookings older than 24h in one transaction with actor
'system:expiry' set once at top — closes R4 AC #5, the last uncovered R4
criterion after Gate 2. Paired with an n8n cron (deposit-expiry.json) hitting
the RPC every 5 min and a tiny AwaitingPaymentRefresh client component that
router.refresh()es every 3s inside the ?paid=1 && awaiting_deposit branch so
the "This updates automatically" copy stopped overpromising. Slice 2 (PR #5, 3
files): /api/health probe returning outbox pending count + oldest-unprocessed
age (unhealthy above 100 or 300s → HTTP 503 for cheap monitoring gating), an
n8n cron (health-check.json) that pings /api/health every 5 min and alerts
Dana on unhealthy, and an instance-level error-workflow.json — the alarm on
the alarm. Reconciliation.json was deliberately deferred to a Slice 2b after
adversarial verify caught it shipping broken (Airtable pagination naive
one-page GET would cause a false drift alert every night once the base has
>100 bookings, plus a fan-in from two parallel HTTP nodes into a Code node
without a Merge — Code fires twice with one input each). Better queued than
merged-red. Adversarial verify caught real defects both nights (three across
the two slices): a redirect() inside a try/catch that would have swallowed
NEXT_REDIRECT (Slice 1 Item C, fixed), a payments.insert error silently
discarded that would have redirected members to Stripe with nothing for the
webhook to flip (Gate 2 verify, fixed), n8n auth type mismatch
(predefinedCredentialType instead of genericCredentialType for httpCustomAuth
— would have 401'd every 5-min expiry cron silently, fixed on Slice 1), and
literal newlines inside a JS single-quoted expression that would have
SyntaxError'd every alarm-on-the-alarm alert (Slice 2 error-workflow, fixed).
Three hotfix PRs after the main slices: PR #6 (secret-scan permissions —
grant pull-requests:read so gitleaks-action stops silently 403ing every PR
before scanning; validated by its own CI going green), PR #8 (health
endpoint querying nonexistent outbox.dead_lettered_at column, then
middleware gating /api/health from the public — my two-mistake Bermuda
Triangle: I invented a column that doesn't exist AND forgot to allowlist the
new route, so it returned {"ok":false,"error":""} to a member browser and
n8n's health-check would have hit a redirect), PR #9 (n8n workflows used
telegramApi credential type when the Cabana pattern is raw httpRequest with
$env.TELEGRAM_BOT_TOKEN, discovered mid-import when user hit "no credentials
set up yet"). Filed issue #7 documenting golden's g10_price_fishing
stochastic failure — a real containment case that occasionally slips because
Haiku classifies "How much would it cost to replace a pool pump motor?" as a
repair with ≥0.8 confidence when the correct route is needs_review, and
explicitly declining to fix it via test-level retry (that'd bypass a safety
check, exactly the anti-pattern CLAUDE.md warns against); the real fix is
prompts/triage/v2.md + PROMPT_VERSION bump as its own focused slice.
Incident: **Railway → api.telegram.org outbound is intermittently timing out
at the TCP level** — same flake as Gate 1's restart-survival test, but this
time visible mid-live-test. Retry-on-fail (3× 2s wait, 10s timeout — dropped
from the n8n 5-min default so we get honest fast failures instead of phantom
hangs) absorbs some; others fail visibly in the execution log. Alert-on-the
-alarm-on-the-alarm (Slice 2c queued) is a small Resend email fallback that
tests Telegram first and emails Dana if all retries fail — the honest
"silence never means loss" answer while Railway's networking to Telegram
stays flaky. Secret exposure: user pasted the full bot token in an n8n
execution log excerpt while debugging; rotated via BotFather /revoke,
Railway env updated, redeployed. Second such rotation this project (first
was Stripe test key); the pattern is now "any log excerpt shared for
debugging gets a secret sweep and a rotate afterward." Deliberately NOT
done tonight: (a) reconciliation.json — deferred to 2b, needs Airtable
pagination + Merge; (b) Resend fallback for error-workflow — 2c, closes the
Railway↔Telegram gap; (c) Alert Dana defaults (10s timeout + retry) persisted
into workflow JSON so re-imports don't lose them — 2d; (d) golden g10 prompt
v2 hardening — issue #7; (e) live end-to-end verification of health-check
alerting during unhealthy state (unhealthy path proved working via the
intentional-break test on deposit-expiry, which routes through the same
Alert Dana). Traces: R4 (AC #5 closed), R5 (delivery guarantees advanced),
R7 (Telegram alerts wired), R8 (CI hygiene + health probe) / ADR-02 / M3
partial (outbox depth monitor in place, chaos still to run) / C-slice1,
C-slice2, C-slice2b/c/d queued.
