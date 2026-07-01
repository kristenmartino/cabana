## What

## Why (traceability)
<!-- Requirement / decision this serves: R# from docs/01-prd.md, ADR-## from docs/03-decisions.md, or C# cut from docs/04-build-plan.md -->

## How verified
<!-- Commands run, tests added/updated, manual checks. "It looks right" is not verification. -->

## Risk & rollback
<!-- What could this break? Money path / delivery path / RLS touched? How do we undo it? -->

## Never-cut check
- [ ] This PR does not weaken: RLS + suite, webhook verification/idempotency, the outbox + DLQ + alerting, the AI fallback path, or the chaos test.
