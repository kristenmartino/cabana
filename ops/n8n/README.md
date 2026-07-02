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

---

## `outbox-consumer.json` — v0 spec (Gate 1)

The Gate-1 slice of the outbox consumer. It is the whole spine's delivery half:
a booking write emits an outbox row (in the same transaction, `emit_booking_event()`
in `0004_pipeline.sql`), and this workflow drains that row to Airtable + Telegram.

**Two entry triggers, one processing chain.** Latency and durability are handled
by *different* mechanisms (ADR-02), not one mechanism doing both:

- **(a) Webhook** — HTTP `POST`, path `cabana-outbox`
  (prod URL `https://n8n-production-097f.up.railway.app/webhook/cabana-outbox`).
  The low-latency *nudge*. The body (`{outbox_id, dedupe_key}`) is ignored beyond
  waking the flow — the nudge says "something happened," the fetch below finds
  out what. Fired best-effort by the DB trigger in `0010_outbox_nudge.sql`.
- **(b) Schedule Trigger** — every **60 seconds**. The *guarantee*/sweep. If the
  nudge is ever lost (n8n down, network blip), the sweep still drains the row
  within ~60s. This is why a dropped nudge is a latency event, never a lost one.

**Shared processing chain:**

1. **Fetch unprocessed rows.** `GET`
   `https://uuviebpmiwzjyabucheo.supabase.co/rest/v1/outbox?processed_at=is.null&order=id.asc&limit=50`
   with the **Supabase service role** credential (adds both `apikey` and
   `Authorization: Bearer` headers). Service role bypasses RLS.
2. **For each row (one n8n item), ACT then MARK** (at-least-once; every consumer
   below is idempotent):
   - **Airtable UPSERT**, keyed on `booking_id` — idempotent, guarantees exactly
     one row per booking even across restarts. `PATCH`
     `https://api.airtable.com/v0/<BASE_ID>/Bookings` with the **Airtable PAT**
     credential (Bearer) and body:
     ```json
     {
       "performUpsert": { "fieldsToMergeOn": ["booking_id"] },
       "records": [{ "fields": {
         "booking_id":   "={{ $json.payload.booking_id }}",
         "status":       "={{ $json.payload.status || $json.payload.to }}",
         "kind":         "={{ $json.payload.kind }}",
         "member_id":    "={{ $json.payload.member_id }}",
         "request_text": "={{ $json.payload.request_text }}",
         "last_synced":  "={{ $now.toISO() }}"
       }}]
     }
     ```
     (`booking.created` payloads carry `status`; `booking.status_changed` carry
     `to` — the expression above reads whichever is present. `member_id` /
     `request_text` are absent on some topics and simply upsert as empty.
     `window_start` exists in the table but is not mapped in v0: neither Gate-1
     payload carries the window — it lands in D8.)
   - **Telegram ping** to the owner chat (`$env.OWNER_CHAT_ID`), sent by `POST`
     to `https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage`
     — both the bot token and the owner chat id come from n8n **environment
     variables** (set on the Railway service), not committed to the JSON.
     Summarize the booking, and include the inline **Approve** keyboard **only**
     when the row's resulting status is `scheduled` — i.e.
     `payload.status === 'scheduled'` (created) **or**
     `payload.to === 'scheduled'` (status_changed). The keyboard:
     ```json
     { "inline_keyboard": [[
       { "text": "✅ Approve",     "callback_data": "approve:<booking_id>" },
       { "text": "↩︎ Needs info",  "callback_data": "needsinfo:<booking_id>" }
     ]] }
     ```
     `callback_data` format is **`approve:<booking_id>`** / **`needsinfo:<booking_id>`** —
     identical to what `supabase/functions/telegram-webhook/index.ts` parses.
   - **On success → MARK delivered.** `PATCH`
     `https://uuviebpmiwzjyabucheo.supabase.co/rest/v1/outbox?id=eq.<id>&processed_at=is.null`
     body `{"processed_at":"<now>"}`, header `Prefer: return=representation`.
     The `processed_at=is.null` filter is load-bearing: if a nudge and a sweep
     race, the second writer's PATCH matches zero rows and is a clean no-op.
   - **On failure of an ACT step → leave it for the sweep.** `PATCH`
     `https://uuviebpmiwzjyabucheo.supabase.co/rest/v1/outbox?id=eq.<id>` body
     `{"attempts": <attempts+1>, "last_error": "<msg>"}`, and **leave
     `processed_at` null** so the 60s sweep retries. If `attempts+1 >= 5`,
     `POST`
     `https://uuviebpmiwzjyabucheo.supabase.co/rest/v1/dead_letters` body
     `{outbox_id, workflow: "outbox-consumer", error, payload}`.
     (Full backoff/alert hardening is D7; v0 must only never *silently lose or
     hang* an event.)

**Known v0 residual (documented, not solved here):** in the rare nudge/sweep
overlap window a Telegram ping can double-**send**. The Airtable upsert cannot
double-**create** — that idempotent upsert is the gate's actual assertion
("exactly one Airtable row per booking"). D7 adds a real row-claim + real
backoff + a DLQ + the instance error workflow, which closes the double-ping.

**Two credentials (referenced by NAME, never inlined):**
- `Supabase service role` — **Custom Auth** (the Supabase gateway needs `apikey`
  *and* PostgREST needs `Authorization: Bearer`, so one Header Auth header isn't
  enough). Credential JSON:
  `{"headers":{"apikey":"<SERVICE_ROLE_KEY>","Authorization":"Bearer <SERVICE_ROLE_KEY>"}}`.
- `Airtable PAT` — Header Auth, Bearer.

**Two Railway env vars** (the Telegram send path reads them, not a credential):
- `TELEGRAM_BOT_TOKEN` — the BotFather token, used in the sendMessage URL.
- `OWNER_CHAT_ID` — the owner's numeric Telegram chat id (kept out of the repo).

**One in-JSON placeholder:** `__BASE_ID__` in the Airtable node URL → replace
with your Airtable base id (`app…`) after import.

The committed `outbox-consumer.json` must contain **no real keys, tokens, base
ids, or chat ids**.

---

## Gate-1 end-to-end runbook

The single-command spine (build-plan §2, Gate 1): a booking write → transactional
outbox → n8n consumes (nudge + 60s sweep) → Airtable row upserted + Telegram ping
with a working Approve button → owner taps Approve → `booking_transitions` row
recorded (actor `owner:telegram`). And it survives an n8n restart mid-flow:
after restart the sweep drains the outbox with **exactly one Airtable row per
booking** and **zero lost events**.

Cloud endpoints (already provisioned — ADR-09):
- Supabase PostgREST: `https://uuviebpmiwzjyabucheo.supabase.co/rest/v1`
- n8n: `https://n8n-production-097f.up.railway.app`
- Owner Telegram chat id: set as the `OWNER_CHAT_ID` env var on the n8n service
  and seeded into `telegram_chats` (role `owner`); read your own via `@userinfobot`.

### Prerequisites (owner-side accounts)
- BotFather bot token + a webhook secret for `telegram-webhook`.
- Railway-hosted n8n reachable over public HTTPS (running).
- Airtable base id (`app…`) **← still needed from the user** and a PAT (scopes
  below).
- Supabase service-role key for the `cabana` cloud project.

### Steps (in order)

1. **Create the Airtable `Bookings` table.** From the repo root:
   ```bash
   AIRTABLE_PAT=<pat> AIRTABLE_BASE_ID=<appXXXX> ./scripts/airtable-setup.sh
   ```
   Idempotent: re-running when the table exists prints the table id and no-ops.
   PAT scopes: `schema.bases:write`, `schema.bases:read`, `data.records:write`,
   **and the base explicitly added to the token**. Note the printed table id.

2. **Import the workflow into n8n.** In n8n → *Workflows* → *Import from File* →
   `ops/n8n/workflows/outbox-consumer.json`.

3. **Set up n8n auth: two credentials + two env vars.**
   - Credential `Supabase service role` — type **Custom Auth**, JSON:
     `{"headers":{"apikey":"<SERVICE_ROLE_KEY>","Authorization":"Bearer <SERVICE_ROLE_KEY>"}}`
     (the 5 Supabase nodes use `httpCustomAuth`; one header isn't enough — the
     gateway needs `apikey`, PostgREST needs `Authorization`).
   - Credential `Airtable PAT` — type **Header Auth**, `Authorization: Bearer <PAT>`.
   - In the **Airtable upsert** node, replace `__BASE_ID__` in the URL with the
     base id from step 1.
   - On the Railway n8n service → *Variables*, set `TELEGRAM_BOT_TOKEN` (BotFather
     token) and `OWNER_CHAT_ID` (owner's numeric chat id), then redeploy so n8n
     picks them up. The Telegram ping reads these via `$env`.

4. **Activate the workflow.** Activation enables both the production webhook
   (`/webhook/cabana-outbox`, not `/webhook-test/...`) and the 60s schedule.
   Confirm the production webhook URL is
   `https://n8n-production-097f.up.railway.app/webhook/cabana-outbox`.

5. **Point the DB nudge at n8n (operator step — the URL is *not* in the repo).**
   Migration `0010` first fired `net.http_post` from a GUC (`app.n8n_nudge_url`),
   but Supabase forbids the project role from persisting a custom GUC
   (`alter database/role … set app.* → 42501 permission denied`), so `0011`
   switched the trigger to read the URL from the service-role-only `app_config`
   table. Set it once on the cloud project (SQL editor or MCP `execute_sql`):
   ```sql
   insert into app_config (key, value)
   values ('n8n_nudge_url', 'https://n8n-production-097f.up.railway.app/webhook/cabana-outbox')
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
   The trigger no-ops when the row is absent (local dev, tests). `pg_net` runs
   the POST *after* the txn commits, so a failed nudge never blocks or fails the
   booking write — the 60s sweep is the guarantee. To disable the nudge:
   `delete from app_config where key = 'n8n_nudge_url';`
   *(Already configured on the `cabana` cloud project.)*

6. **Deploy the Telegram Approve slice.** Deploy the updated
   `telegram-webhook` edge function (its callback_query block now parses
   `approve:<id>` / `needsinfo:<id>` and calls
   `transition_booking(p_to_status:'confirmed', p_actor:'owner:telegram')`):
   ```bash
   supabase functions deploy telegram-webhook --project-ref uuviebpmiwzjyabucheo
   ```
   Register the webhook (once) with the secret token:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
     ?url=<telegram-webhook-fn-url>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   The owner chat must be in `telegram_chats` with role `owner` (already seeded
   on cloud).

7. **Run the spine driver.** From the repo root, with the cloud project's
   service role in the environment (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
   or the `NEXT_PUBLIC_SUPABASE_URL` the app uses):
   ```bash
   SUPABASE_URL=https://uuviebpmiwzjyabucheo.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
   npx tsx scripts/spine-demo.ts
   ```
   It inserts one booking at status `scheduled` (seeded member Ken `a1…01`,
   property `c1…01`, tech Ray `7e…03`, a free future window), which emits
   `booking.created` with `status: 'scheduled'` → the ping carries the Approve
   button. The driver polls the outbox and prints `processed_at` transitions,
   then prints the `booking_transitions` rows and exits 0 once the created row
   is processed.

8. **Tap Approve in Telegram.** The owner taps **✅ Approve**. Expect the buttons
   to clear (so the message can't be re-tapped) and a `booking_transitions` row
   `scheduled → confirmed` with actor `owner:telegram`. Idempotency is layered:
   the keyboard-clear prevents a re-tap; a rare race that beats it re-runs
   `scheduled → confirmed` while already `confirmed`, which the guard (0007)
   no-ops (no P0001, no duplicate audit/outbox row). The bot's P0001
   "Already handled" path fires only for a genuinely stale tap — a booking that
   has since left `scheduled` for a terminal state.

9. **Clean up the demo row (optional):**
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/spine-demo.ts --cleanup
   ```

### Restart-survival test (the Gate-1 assertion)

Proves the outbox survives an n8n restart mid-flow with **exactly one Airtable
row per booking** and **zero lost events**.

1. **Stop n8n first**, so rows queue in the outbox unprocessed. In Railway:
   *cabana n8n service → Deployments → Stop* (or restart-and-immediately-hold).
   Confirm no consumer is running.
2. **Insert several bookings while n8n is down.** Run `scripts/spine-demo.ts`
   a few times (or insert directly via PostgREST with the service role). Each
   emits a `booking.created` outbox row; with n8n down, the nudge POSTs fail
   silently (best-effort) and the rows sit with `processed_at = null`. Verify:
   ```
   GET .../rest/v1/outbox?processed_at=is.null&select=id,dedupe_key,topic
   ```
   should list all the just-inserted rows.
3. **Restart n8n** (Railway → *Restart*/*Deploy*). Do **not** re-send any nudge.
4. **Let the 60s sweep drain the backlog.** Within ~60s the Schedule Trigger
   fetches the null rows and processes them. This is the durability guarantee
   doing its job with the nudge absent.
5. **Assert:**
   - **Exactly one Airtable row per booking** — query the Airtable `Bookings`
     table (or the base UI); each `booking_id` appears once. Re-running the
     sweep must not create duplicates (idempotent upsert on `booking_id`).
   - **Zero lost events** — every outbox row now has `processed_at` set:
     ```
     GET .../rest/v1/outbox?processed_at=is.null   → []  (empty)
     ```
     and no rows in `dead_letters` for these bookings.
   - The Telegram ping(s) arrived; the `scheduled` ones carry the Approve button.

The only accepted v0 imperfection is a possible duplicate Telegram *ping* in the
narrow nudge/sweep overlap window (documented above). A duplicate Airtable row
is a **failure** of the gate, not an accepted residual.
