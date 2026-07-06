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

## Day 5 — Slice 2c+2d: alert-channel DLQ (Resend fallback) — Railway↔Telegram incident closed
Bundled 2c+2d (PR #13, closes #11/#12) through the orchestration harness. The
Day-4 incident — Railway → api.telegram.org intermittent TCP timeouts that can
exhaust an alert's retries and leave error-workflow itself erroring silently —
is now closed with a second-tier alert path. Alert Dana (Telegram) in both
health-check.json and error-workflow.json uses onError continueErrorOutput:
success routes to main[0] (empty — no duplicate, Dana already got the Telegram),
failure-after-3-retries routes to main[1] → a new Alert Dana via Email node that
POSTs to Resend from alerts@mail.kristenmartino.ai. Verified live end-to-end:
broke the Telegram URL, forced an upstream error, watched Alert Dana burn 3
retries (~30s at the persisted 10s timeout), then the fallback email landed in
the demo inbox with the correct upstream failure context. 2d persisted the
retry/timeout defaults (retryOnFail 3×2s, timeout 10s vs n8n's 5-min default)
into the JSON so re-imports stop dropping them — the Day-4 manual-toggle lesson.
Adversarial verify earned its keep again: a dedicated context-references
verifier caught the email node in health-check using bare $json, which on Alert
Dana's error output is the Telegram HTTP failure object, NOT the ping response —
would have emailed "the Telegram call 5xx'd" instead of the actual health
failure. Fixed to $('Ping /api/health').item.json (error-workflow's author got
$('On workflow error') right first try). One false-positive blocker (newline
escaping — verifier miscounted escaping levels reading the built-object JSON;
on-disk \\n was already correct). Operational learnings banked: (1) n8n keeps
its own DB copy of every workflow — pulling the file locally does nothing;
re-import is mandatory to push changes, and re-import resets the
default-error-workflow setting + can silently import a stale version if the PR
isn't merged first (user re-imported the pre-2c/2d 4-node health-check off an
unmerged main before we caught it); (2) the errorTrigger node sits at [-400,0],
often scrolled off-canvas on import — looks "missing" until zoom-to-fit; (3)
Resend API keys are view-once — the SMTP key can't be recovered from Supabase's
masked field, so n8n got its own scoped key (cabana-n8n-alerts), which is better
hygiene anyway (revoke one consumer without breaking the other). Deliberately
NOT done: third-tier fallback if Resend ALSO fails (out of scope — those
failures are visible in n8n's execution log, the acceptable ceiling). Deferred
queue unchanged: #10 (2b reconciliation), #7 (golden g10 prompt v2), then Slice
3 (R6 Airtable + R7 bot commands), Slice 4 (chaos), Slice 5 (v1.0). Traces: R5
(delivery guarantees — alert channel now has its own DLQ), R6 (email infra
proven) / ADR-02 / never-cut #3 / closes #11, #12.

## Day 5 (cont.) — #7 golden: temperature 0 + v2 prompt; triage is now deterministic
What looked like a one-case flake (g10_price_fishing) turned out to be the whole
golden set running non-deterministically. The tell: consecutive CI runs failed
almost-disjoint case sets (g05/g17/g19, then g12/g13/g16/g17/g19) — stochastic
variance, not a prompt bug. Root cause: the triage call never set temperature,
so it defaulted to 1.0; Haiku's confidence swung run-to-run and borderline cases
flipped across the 0.8 auto-qualify gate at random. The golden set had been
FLAKY-GREEN this whole time — passing only when the coin flips happened to land,
which is why it reddened random PRs. Fixed at the root: temperature 0 in
lib/triage/index.ts. Triage is a classifier — the same message must route the
same way on resubmit, in production and in CI alike; determinism is a feature,
not just a test convenience. That single change is the real fix behind #7.
Temperature 0 then made the run reproducible, which exposed four cases that had
been flaky-passing — all genuine triage gaps, hardened in prompts/triage/v2.md
(v1 immutable per ADR-08; PROMPT_VERSION bumped; buildPrompt now derives the
filename from the version so they can't drift): (1) price-only questions →
plan_question/human, narrowly scoped so a reported fault or service request
still classifies by the work (g10, protects g05); (2) hard rule 9 —
attachment-dependent messages ("see the attached photo") get confidence ≤0.3 →
human, because the AI can't qualify what it can't see (g19); (3) complaint
priority — recurring failure + ultimatum/threat-to-leave is a complaint even
when a fault is named, so angry customers reach a human instead of
auto-qualifying (g16, a containment case); (4) one_off_clean counts from new
members and swampy/green water without equipment symptoms is a cleaning need,
not a repair (g17). These are real principles, not test-gaming. Result: golden
19/20 (95%), 100% containment, DETERMINISTIC — the first time the gate can
actually function as a regression gate on future prompt changes rather than a
coin flip. The lone non-containment miss (g09_overflow_now routing an urgent
overflow to needs_review) is safe-side and clears the ≥90% gate with margin;
noted as a possible future tighten, doesn't gate. Iterated entirely through CI
(deterministic runs made each one a clean signal) per the user's validate-via-CI
call; four pushes to converge. Traces: R2 (golden ≥90% + 100% containment),
never-cut #4 / ADR-08 / closes #7. Queue now clear of follow-ups; next is Slice
3 (R6 Airtable console + R7 Telegram commands), then Slice 4 chaos, Slice 5 v1.0.

## Day 6 — Slice 3 CLOSED: R6 owner console + R7 owner bot, both proven live
The two remaining P0 requirements after the money path are done. Orchestrated
the code halves (Haiku authors + adversarial verify), deployed via CLI/MCP, and
proved every path live on cloud.

R7 — Telegram bot (PR #16, deployed): command router on top of the Gate-1 auth +
Approve slice (preserved byte-for-byte). /today + /week read a new get_schedule
RPC (0015) that does the ET day/week RANGE math in SQL — CLAUDE.md forbids
new Date() string math near booking windows, so boundaries live in Postgres and
the edge fn only formats via Intl. /week groups by tech. /cancel goes through
transition_booking('owner:telegram') with P0001/P0002 handling. /brief is Haiku
(temp 0) summarizing strictly from query rows, never inventing, "nothing
scheduled" on empty, and try/catch-wrapped so a missing key / model failure
degrades to "Brief unavailable" not a 500. Adversarial verify caught an HTML
injection (unescaped tech display_name would 400 the whole Telegram send) —
fixed with an esc() helper.

R6 — Airtable console (PRs #17 write-back fn, #18 enrichment, Marie guide):
- Write-back edge fn (PR #17): mark_completed -> transition_booking('completed',
  'office:airtable'), visit_notes -> direct update, every outcome logged to
  sync_log via a logSync() helper (verify caught silent sync_log inserts). ADR-01
  whitelist stays exactly {visit_notes, mark_completed}.
- Enriched projection (PR #18): surgical, additive edit to the never-cut
  outbox-consumer — the enrich query now embeds members(full_name),
  properties(address), techs(display_name), payments(status) via PostgREST FK
  embedding (all 4 FKs confirmed live first), and Build actions derives
  member_name/address/tech_name/deposit_status. Fail-safe: optional-chained +
  Array.isArray-guarded, so a missing embed projects null, never breaks delivery.
  Delivery graph proven byte-identical.
- Console (user-built in Airtable): 5 grid views + a "This Week by Tech" Record
  Review interface, grouped by tech, showing real enriched data (Rosa Delgado /
  77 Cypress Trail / Jenna / paid / confirmed — no uuids). Marie one-page guide
  committed.
- Write-back round-trip PROVEN LIVE: Marie checks mark_completed on a confirmed
  booking -> edge fn -> transition -> booking 'completed', audited
  'office:airtable', sync_log 'applied'. visit_notes edit -> 'applied'. Guard
  test: mark_completed on a scheduled booking -> 409, guard held, no illegal
  completion. Airtable stays a projection; Supabase stays authoritative; the two
  whitelisted fields round-trip; every change audited by channel.

Spine re-test (never-cut #3) surfaced two real findings, neither a regression,
both filed: (#19) re-importing outbox-consumer resets the Airtable URL to the
committed __BASE_ID__ placeholder -> 404 until re-edited inline; fix is
{{ $env.AIRTABLE_BASE_ID }}. (#20) the Railway->Telegram intermittent TCP
timeout now visibly hits the CORE outbox delivery ping (not just alerts) — the
Airtable and Telegram legs are coupled, so a Telegram flake blocks the row from
marking processed even though Airtable delivered; retry/dead-letter/alert still
means never-silent, but the delivery ping has no email fallback like the Slice-2c
alert path does. During that test the health-check fired (pending:1, oldest>300s
-> 503) AND the alert reached Dana via the Resend email fallback because Telegram
was down — Slice 2c validated live, for real. Test artifact (row 24, a
booking.status_changed stuck on the Telegram leg) marked processed to clear the
monitor; d1...0004 left confirmed then completed via the write-back test.
Deferred/known: #19, #20, plus a minor UX gap — a rejected write-back leaves the
Airtable checkbox checked (no auto-revert), against the Marie guide's "it
reverts" promise; candidate follow-up. Next: Slice 4 chaos day (M3 evidence),
then Slice 5 v1.0. Traces: R6, R7 / ADR-01, ADR-07, ADR-08 / never-cut #3, #4 /
M-owner-console, M-owner-bot / C-slice3.

## Day 7 — CHAOS DAY: Gate 3a closed, M3 proven live (run cx20260706T2052)
The guarantees got earned. 50 bookings injected through the real code path
(create_member_request → live Haiku triage → ai_events → apply_triage; five of
them with the API key stripped to fire the production fallback), against the
live cloud stack, marker-scoped, no reset. The scripted sabotage all landed —
and reality improvised harder than the script: n8n deployment removed for 90s
mid-inject (backlog peaked at 48 pending with zero consumers, nothing lost);
Stripe checkout.session.completed replayed 5x across the two Gate-2 events
(ledger swallowed all of them); the 60-second Airtable token break turned into
~25 MINUTES of continuous 401s because the manual token restore was imperfect
and the PAT had to be regenerated — the retry loop just kept absorbing it; and
the double-tap test upgraded itself: a retry re-delivered the same Approve ping
twice (at-least-once delivery working as designed), the owner approved the same
booking from two different messages, and the audit shows exactly ONE confirmed
transition — the guard no-opped the duplicate.

VERIFY: ALL FOUR ASSERTIONS PASS. A1: 50/50 Airtable exactly-once — zero
missing, zero duplicated, zero strays, through the n8n kill and the extended
auth outage (the idempotent upsert retried until auth returned). A2: 103 chaos
outbox rows, zero limbo, zero silent bookings, 43 dead-lettered — every one
recorded and alerted, never silence. A3: zero duplicate created events, zero
duplicate (booking,to_status) transitions — through the replays and the
duplicate approve. A4: both Stripe-originated payments ledger-verified with
exactly one awaiting_deposit→scheduled each; one seed fixture (paid, null
session id) transparently skipped and stated in the log. M2: p50 858s / p95
2478s — grotesque, and honestly annotated: the numbers include a 90s consumer
kill and a 25-minute auth outage; the guarantee under test is delivery, and
delivery was perfect. Evidence committed: scripts/chaos/runs/cx20260706T2052.log
(+ state json). Cleanup was surgical: 50 Airtable records, 843 dead_letters,
103 outbox rows, 103 transitions, 50 bookings deleted; DB verified back to the
exact pre-chaos baseline (12 bookings, 0 pending, dead_letters at the historic
25). ai_events kept (flat log; ~50 real triage calls now on record).

Chaos found exactly one real design flaw — which is the day working as
intended: DEAD-LETTER IS NOT TERMINAL (#23). The consumer inserts the
dead_letters row + alert but leaves processed_at null, so the sweep re-retries
forever: rows hit attempts 19-22 (threshold 5) and 798 duplicate dead-letter
rows piled up with repeated alerts. M3 held regardless (nothing lost, nothing
silent — louder than intended, if anything), but the semantics are wrong; fix
is a dead_lettered_at column + sweep filter (migration 0016), filed with a
redrive runbook note. Two smaller run-day fixes landed on main: the ws
transport for Node 20 (same fix the RLS helper used — supabase-js demands a
WebSocket at construction) and A4 scoping to non-null session ids (seed
fixtures predate Stripe wiring; skipped count stated in the log, nothing
silently ignored). Also proven incidentally: the health-check + Resend email
fallback fired correctly when the outage aged rows past 300s — the monitoring
stack watched the chaos in real time. Traces: R5, R8 / M2, M3 / never-cut #3,
#5 / Gate 3a CLOSED. Remaining: Slice 5 — README + failure-modes, Loom,
Vercel postmortem, Claude Desktop hour, tag v1.0.
