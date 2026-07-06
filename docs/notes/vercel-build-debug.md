# Vercel debugging notes — three real incidents

The build plan called for deliberately breaking one Vercel build and writing a
postmortem of the induced failure. By the time that slot came up, production
had supplied three genuine incidents diagnosed on the Vercel deployment — one
Supabase-config, one Vercel-platform, one app-code, which is itself
representative: deploy-surface debugging is rarely about the platform alone.
Real failures make a better fluency artifact than a staged one, so these are
documented instead — the honest trade is noted here rather than hidden.

---

## Incident 1 — Magic links redirect to `localhost:3000` from the production deploy

**Symptom.** First Vercel deploy of the portal (Phase 2): sign-in email
arrives, clicking the link opens `http://localhost:3000/?code=…` — connection
refused on any machine that isn't running the dev server.

**Diagnosis path.** The link's `redirect_to` parameter was visible in the
email URL itself — no server logs needed. It pointed at localhost, meaning
Supabase Auth had fallen back to its **Site URL**, which new Supabase projects
default to `http://localhost:3000`. The app passed a correct `emailRedirectTo`,
but Supabase silently ignores it when the URL isn't on the **Redirect URLs
allowlist**.

**Fix.** Set Site URL to the production domain; add explicit
`https://<deploy>/**` entries per branch. Lesson that stuck: **Supabase's
wildcard matching across `-`-separated preview subdomains is not to be
trusted** — explicit per-branch entries beat one clever wildcard, and the
failure mode is silent fallback, not an error.

## Incident 2 — Env var added, behavior unchanged: build-time vs request-time

**Symptom.** `ANTHROPIC_API_KEY` added to the Vercel project for the triage
feature; live requests still behaved as if it were absent (every intake
routed to `needs_review`, `ai_events` rows showing 3ms latency and zero
tokens — the fallback path's signature).

**Diagnosis path.** The `ai_events` telemetry was the log that mattered:
3ms + zero tokens means the SDK constructor threw before any network call —
the key was `undefined` *in the running deployment*. The variable existed in
project settings but **deployments snapshot env at build time**; an existing
deployment never sees later env changes.

**Fix.** Redeploy (any new build) after env changes. Lesson: on Vercel, env
edits are inert until the next build — pair every env change with a redeploy,
and instrument the fallback path well enough that "key missing" is legible
from your own telemetry (ours was, by design — never-cut #4).

## Incident 3 — `/api/health` returns `{"ok":false,…,"error":""}` in production

**Symptom.** New health endpoint deployed; production returns a 503 with an
*empty* error string — the least helpful possible failure.

**Diagnosis path.** Two layers deep. (1) The empty message: the code fell back
only to `error.message`, but PostgREST 400s can carry the detail in
`.details`/`.hint`/`.code` with an empty `.message`. Widening the fallback
surfaced the real error: **the query filtered on a column that doesn't exist**
(`outbox.dead_lettered_at` — dead-lettering actually lives in a separate
table; the column was assumed to exist without checking the schema). (2) A second, compounding bug found during verification: the
members-only middleware was intercepting `/api/health` and redirecting the
n8n prober to the sign-in page — monitors don't carry session cookies.

**Fix.** Query `processed_at is null` only; widen the error fallback chain so
PostgREST failures are never blank; allowlist `/api/health` in the middleware
(it returns only aggregate counts — no PII). Lessons: verify column names
against the live schema, never assume them; and every new public-ish route
must be walked through the auth gate's eyes — *a monitor that gets redirected
to sign-in will happily report whatever the sign-in page's status code is.*

---

**Common thread.** All three failures were **silent-by-default**: a silent
fallback to Site URL, a silently inert env var, an empty error string plus a
silent redirect. None of them threw where the bug was. The project's central
rule — silence never means healthy, make systems loud about their failure
modes — applies to platform configuration exactly as much as to pipelines.
