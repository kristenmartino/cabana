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
