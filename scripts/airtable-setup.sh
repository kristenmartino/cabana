#!/usr/bin/env bash
# scripts/airtable-setup.sh — create the Airtable 'Bookings' projection table
# (R6 / ADR-01: Airtable is a one-way projection of Supabase; this script only
# provisions the *shape* the n8n outbox-consumer upserts into).
#
# Idempotent-friendly: if a table named 'Bookings' already exists in the base,
# the script prints its id and exits 0 without touching it. Field names and
# single-select options below MUST stay identical to the n8n upsert body in
# ops/n8n/workflows/outbox-consumer.json and the payload keys emitted by the
# outbox trigger (0004_pipeline.sql) — see the "cross-artifact invariants" note
# in the Gate-1 runbook (ops/n8n/README.md).
#
# ---------------------------------------------------------------------------
# Required Airtable Personal Access Token (PAT) scopes:
#   - schema.bases:write   (create the table + fields via the Meta API)
#   - schema.bases:read     (detect an existing 'Bookings' table — idempotency)
#   - data.records:write    (used later by the n8n consumer's upsert, not here;
#                            listed so ONE PAT covers setup + runtime)
# The PAT must also have THIS BASE explicitly added to its access list
# (Airtable PATs are deny-by-default per base).
# ---------------------------------------------------------------------------
#
# Env (no secrets in this file):
#   AIRTABLE_PAT      — the PAT described above
#   AIRTABLE_BASE_ID  — the target base id (starts with 'app...')
#
# Usage:
#   AIRTABLE_PAT=pat_xxx AIRTABLE_BASE_ID=appXXXX ./scripts/airtable-setup.sh

set -euo pipefail

: "${AIRTABLE_PAT:?set AIRTABLE_PAT (PAT with schema.bases:write + this base added)}"
: "${AIRTABLE_BASE_ID:?set AIRTABLE_BASE_ID (the target base, appXXXXXXXXXXXXXX)}"

API="https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables"
AUTH="Authorization: Bearer ${AIRTABLE_PAT}"
TABLE_NAME="Bookings"

echo "airtable-setup: checking base ${AIRTABLE_BASE_ID} for a '${TABLE_NAME}' table..."

# --- Idempotency: does 'Bookings' already exist? ---------------------------
# List tables and detect a table named 'Bookings' WITHOUT a jq dependency (the
# repo makes no jq guarantee). Airtable table ids always start with 'tbl' and
# field ids with 'fld'; every table object begins with {"id":"tbl...". We split
# the response into one line per table object (newline before each {"id":"tbl),
# then find the line that also contains "name":"Bookings" and read its leading
# 'tbl...' id. This is position-independent, so a *field* literally named
# "Bookings" (whose parent object starts {"id":"fld...) can never be mistaken
# for the table — which would otherwise skip creation against a base lacking it.
existing_response="$(curl -sS -H "${AUTH}" "${API}")"

# Surface Airtable auth/scope errors clearly instead of "no table found".
if printf '%s' "${existing_response}" | grep -q '"error"'; then
  echo "airtable-setup: Airtable API returned an error listing tables:" >&2
  printf '%s\n' "${existing_response}" >&2
  echo "airtable-setup: check the PAT scopes (schema.bases:read/write) and that this base is added to the token." >&2
  exit 1
fi

# One line per table object; keep the line whose *table* name is 'Bookings' and
# read its leading 'tbl...' id. The table name is the value immediately after
# the object-opening {"id":"tbl...","name":" — anchoring to that shape means a
# field named "Bookings" later on the same line does not match (it is not the
# table's own name). `|| true` guards grep's exit-1 (no match) against `set -e`.
existing_id="$(
  printf '%s' "${existing_response}" \
    | awk '{ gsub(/\{"id":"tbl/, "\n{\"id\":\"tbl"); print }' \
    | grep -E '^\{"id":"tbl[[:alnum:]]+","name":"'"${TABLE_NAME}"'"' \
    | grep -oE 'tbl[[:alnum:]]+' \
    | head -n1 \
    || true
)"

if [ -n "${existing_id}" ]; then
  echo "airtable-setup: '${TABLE_NAME}' already exists (table id: ${existing_id}) — no-op."
  echo "${existing_id}"
  exit 0
fi

echo "airtable-setup: '${TABLE_NAME}' not found — creating it."

# --- Create the table ------------------------------------------------------
# Field types + single-select options mirror the Supabase schema exactly:
#   status  -> bookings.status check constraint (0002_bookings.sql)
#   kind    -> bookings.kind   check constraint (0002_bookings.sql)
# 'booking_id' is the PRIMARY field (Airtable requires the first field to be a
# text/number/etc. primary) and is the upsert merge key.
create_payload="$(cat <<'JSON'
{
  "name": "Bookings",
  "description": "One-way projection of Supabase bookings (R6/ADR-01). Upsert-merged on booking_id by the n8n outbox-consumer. Do not hand-edit projected fields — non-whitelisted edits are overwritten by the next sync.",
  "fields": [
    { "name": "booking_id", "type": "singleLineText" },
    {
      "name": "status",
      "type": "singleSelect",
      "options": {
        "choices": [
          { "name": "requested" },
          { "name": "needs_review" },
          { "name": "awaiting_deposit" },
          { "name": "scheduled" },
          { "name": "confirmed" },
          { "name": "completed" },
          { "name": "cancelled" },
          { "name": "no_show" }
        ]
      }
    },
    {
      "name": "kind",
      "type": "singleSelect",
      "options": {
        "choices": [
          { "name": "repair" },
          { "name": "one_off_clean" },
          { "name": "plan_visit" }
        ]
      }
    },
    { "name": "member_id", "type": "singleLineText" },
    { "name": "request_text", "type": "multilineText" },
    { "name": "window_start", "type": "dateTime", "options": {
        "dateFormat": { "name": "iso" },
        "timeFormat": { "name": "24hour" },
        "timeZone": "utc"
      } },
    { "name": "last_synced", "type": "dateTime", "options": {
        "dateFormat": { "name": "iso" },
        "timeFormat": { "name": "24hour" },
        "timeZone": "utc"
      } }
  ]
}
JSON
)"

create_response="$(
  curl -sS -X POST "${API}" \
    -H "${AUTH}" \
    -H "Content-Type: application/json" \
    --data "${create_payload}"
)"

if printf '%s' "${create_response}" | grep -q '"error"'; then
  echo "airtable-setup: table creation failed:" >&2
  printf '%s\n' "${create_response}" >&2
  echo "airtable-setup: confirm the PAT has schema.bases:write and this base is on the token." >&2
  exit 1
fi

# The create response is a single table object; its top-level id is the new
# 'tbl...' id and appears first. Read the first 'tbl...' token, robustly.
new_id="$(
  printf '%s' "${create_response}" \
    | grep -oE 'tbl[[:alnum:]]+' \
    | head -n1 \
    || true
)"

echo "airtable-setup: created '${TABLE_NAME}' (table id: ${new_id})."
echo "${new_id}"
