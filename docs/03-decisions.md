# Cabana — Architecture Decision Records

Compact ADR format: Context → Options → Decision → Trade-offs accepted → Revisit when. All **Accepted**, July 2026, decider: Kristen Martino (solo engineer — which is itself the operating condition several of these decisions respond to).

---

## ADR-01 — Supabase is the source of truth; Airtable is a projection

**Context:** The office persona needs a CRM-like console (views, interfaces, light edits — R6). Airtable is ideal for that persona but catastrophic as a second source of truth: bidirectional sync between two databases with different consistency models is a well-known tarpit, and this project has one engineer and ten days.

**Options:**
- **A. Full two-way sync.** Maximum office flexibility; conflict resolution, ordering, and loop-prevention complexity that can consume the entire schedule and still drift.
- **B. Strictly one-way (read-only Airtable).** Trivially safe; fails R6/D7 — Marie must be able to *do* things, or she keeps her own spreadsheet and the shadow system returns.
- **C. One-way projection + whitelisted write-back (2 fields) through a validating edge function.** Nearly all of B's safety, exactly the flexibility D7 requires.

**Decision:** C. Supabase authoritative always; write-back limited to `mark completed` and `visit notes`; conflicts resolve to Supabase with an audit entry; non-whitelisted edits are overwritten by the next sync *and logged* so the behavior is a documented rule, not a surprise. Nightly reconciliation makes any drift visible within 24h.

**Trade-offs accepted:** Marie will occasionally edit a field that snaps back (mitigated by locking non-editable fields in the Interface). Expanding the whitelist requires code, deliberately — every write-back field is a consistency liability and should cost a decision.

**Revisit when:** the whitelist request list exceeds ~5 fields — at that point the office persona has outgrown a projection and deserves a real admin surface in the app.

---

## ADR-02 — Transactional outbox consumed by n8n, not fire-and-forget webhooks or a code-only pipeline

**Context:** R5's bar is explicit: no side effect (Airtable row, owner ping, member email) may ever be silently lost. Three integration points fail independently.

**Options:**
- **A. Database webhooks / triggers calling n8n directly.** Simple; fire-and-forget — if n8n is down at that moment, the event is gone. This is the amateur default and the exact "silently drops data" failure the requirement names.
- **B. Code-only pipeline (queue + workers in the app).** Full control, testable; but orchestration becomes invisible to the operator, and every notification tweak is a deploy. For an SMB client, "the owner can open n8n and *see* the flow" is a real feature.
- **C. Transactional outbox (event committed atomically with the state change) + n8n consumption: DB-webhook nudge for latency, 60s sweep for guarantee, dedupe key for safety, retries → dead-letter → Telegram alert, nightly reconciliation as the backstop.**

**Decision:** C. At-least-once delivery with idempotent consumers; latency and durability handled by different mechanisms instead of asking one mechanism to do both.

**Trade-offs accepted:** More moving parts than A; ~60s worst-case latency when the nudge misses; n8n workflow logic is versioned as exported JSON in-repo rather than as first-class code (mitigated by keeping *decisions* in the database and only *delivery* in n8n).

**Revisit when:** event volume or workflow complexity makes n8n the bottleneck — the outbox is consumer-agnostic by design, so swapping the consumer doesn't touch the guarantee.

---

## ADR-03 — Stripe Checkout (hosted), with webhooks as the sole authority on payment state

**Context:** R4. The deposit is the money path; the two classic failures here are trusting the success-redirect and processing webhook events non-idempotently.

**Options:**
- **A. Payment Element (embedded).** Branded, seamless; more surface area (payment intents lifecycle, SCA edge cases, more PCI-adjacent code) for a $75 deposit.
- **B. Stripe Checkout (hosted).** Minimal code, Stripe-maintained compliance surface, mobile-solid; less visual control.

**Decision:** B, plus two invariants that hold regardless of surface: (1) payment state transitions originate *only* from signature-verified webhook events, with event IDs persisted in `stripe_events` for idempotency and out-of-order tolerance; (2) the success redirect is cosmetic — it renders "confirming…" until the database says paid.

**Trade-offs accepted:** Checkout page isn't fully branded (acceptable: trust cues of a Stripe-hosted page arguably *help* a small business). Webhook-authoritative design means local dev needs Stripe CLI forwarding — documented in the README.

**Revisit when:** payments expand beyond deposits (plan billing migration, P2) — that conversation reopens the surface choice and subscription objects.

---

## ADR-04 — Inbound webhooks land in Supabase Edge Functions; orchestration does not live there

**Context:** Stripe, Telegram, and the Airtable write-back all need an inbound HTTPS surface. Candidates: Next.js route handlers on Vercel, or Supabase Edge Functions.

**Options:**
- **A. Next.js route handlers.** One codebase, one deploy; couples webhook availability to frontend deploys, and raw-body signature verification in Next.js is a recurring papercut.
- **B. Supabase Edge Functions.** Adjacent to the data they mutate, independently deployable, secrets scoped at the function; a second deploy target.

**Decision:** B, with a strict job description: validate authenticity, translate to a state change + outbox row, return. No orchestration, no third-party calls out (that's n8n's lane, ADR-02). This keeps each function small enough to test exhaustively.

**Trade-offs accepted:** Two deploy targets and a Deno runtime alongside Node — accepted as the cost of decoupling inbound truth from frontend release cadence.

**Revisit when:** function count or shared logic grows past ~5 — consolidation into a single gateway function or the app becomes worth re-examining.

---

## ADR-05 — Lovable generates the member-facing UI scaffold, behind a fence

**Context:** Speed on Day 3 matters, and demonstrating "ship a UI from a prompt, then hand-edit without breaking it" is an explicit goal. Unfenced AI-scaffold output tends to rot: inline styles, duplicated fetch logic, client-side data access.

**Options:** hand-build everything (slower, uniform quality) vs. scaffold everything (fast, architecture erosion) vs. **scaffold only the member-facing pages, then a mandatory refactor pass before merge**.

**Decision:** Fenced scaffold. The fence: Lovable touches presentation for member pages only; all data access is replaced with typed server actions; auth/middleware, edge functions, schema, and anything touching money or Telegram are hand-built. The refactor checklist (typed props, server actions only, tokens instead of magic values, dead code removed, a11y pass) is in-repo, and the scaffold-import commit is kept separate from the refactor commits so the diff itself documents the hand-editing.

**Trade-offs accepted:** Some scaffold output gets discarded (fine — its job was momentum); visual language is partly inherited (fine for v1).

**Revisit when:** never silently — the fence is the policy. Widening it is a new ADR.

---

## ADR-06 — Plan billing stays in QuickBooks; Stripe handles repair deposits only

**Context:** D4: recurring autopay for 280 members already works and the owner said "do not touch that." The migration would dominate the timeline, create real financial risk during cutover, and solve a problem nobody reported.

**Options:** migrate everything to Stripe (clean single system, maximal risk and effort, zero reported pain addressed) vs. **coexist: new money path in Stripe, existing money path untouched, a nullable `external_billing_ref` as the future bridge**.

**Decision:** Coexist. This is the project's load-bearing scope cut, made in the discovery room and preserved in writing (NG1).

**Trade-offs accepted:** Two payment systems on the books; deposit-to-invoice matching is manual for now. Both are cheap relative to a billing migration's tail risk.

**Revisit when:** Dana asks for consolidated reporting or deposit-invoice matching becomes a weekly annoyance — then P2's QuickBooks *read* integration comes first; migration remains a separate, later decision.

---

## ADR-07 — Telegram bot in webhook mode with a chat allowlist

**Context:** R7. The bot can approve real work orders — it is an admin surface that happens to live in a chat app, and anyone can message any Telegram bot.

**Options:** long-polling (easy in dev, fragile and stateful in prod) vs. **webhook mode** (push, stateless, requires public HTTPS + validation discipline).

**Decision:** Webhook mode into an edge function, with `secret_token` verified on every update, and authorization by chat-ID allowlist (`telegram_chats`) checked before any handler runs. Unknown chats get a refusal, a rate limit, a log line, and an alert to Dana. Inline-button callbacks are idempotent (Telegram redelivers). Dev uses a tunnel; prod points at the deployed function.

**Trade-offs accepted:** Slightly more setup than polling; a tunnel dependency during local dev. Both trivial next to shipping an unauthenticated admin surface.

**Revisit when:** more roles need bot access (techs, v1.5) — allowlist grows a role column it already has; the model holds.

---

## ADR-08 — Claude Haiku for triage, confidence-gated, structurally unable to commit

**Context:** R2/D8. The AI's value is speed-to-first-response and structured qualification; its risk is a confident wrong promise to a member. Dana's own words define the spec: a wrong confident answer is worse than a slow one.

**Options:**
- **A. Large model, broad authority** (drafts *and* schedules). Most impressive demo, exactly the failure mode D8 prohibits.
- **B. No AI** (form with dropdowns). Safe, but reinstates the friction that loses intake (D1) and abandons a core reason to build custom.
- **C. Small model (Haiku), narrow contract:** classify + extract + draft against a zod schema; confidence-gated to a human queue; timeout → human queue; *no code path exists* by which model output changes price, time, or any status beyond `awaiting_deposit`/`needs_review`.

**Decision:** C. Safety is architectural (unrepresentable actions), not rhetorical (a prompt asking nicely) — the prompt still asks nicely, but nothing depends on it. Golden set in CI, including injection attempts, makes the guardrails regression-tested rather than assumed. `ai_events` makes cost, latency, and every historical decision auditable.

**Trade-offs accepted:** Some qualified requests will route to human review unnecessarily (tunable threshold; the cost is Dana's time, the currency she chose to spend in D8). Haiku will misread genuinely ambiguous messages — by design those score low confidence and land with a human.

**Revisit when:** golden-set failures concentrate in a category Haiku can't handle — escalate the model for that category only, justified by the eval, and record it here.
