# Cabana — Discovery Notes (Scoping Call)

**Project:** Cabana — member portal + ops automation for a residential pool service company
**Client (fictional):** Sailfish Pool Care, Jupiter, FL — owner "Dana"
**Date:** July 2026 · **Attendees:** Dana (owner), Kristen (engineer)
**Purpose of this doc:** Capture what was learned, not what was pitched. Every requirement in the PRD traces back to an answer here (see traceability table at the end).

> This is a demonstration project. The client, answers, and figures are fictional but constructed to be operationally realistic for a 3-tech residential pool service company. No real customer data is used anywhere in the build.

---

## Client snapshot (pre-call research, 10 minutes)

- ~280 residential customers ("members") on weekly maintenance plans, three tiers, billed monthly via QuickBooks autopay.
- 3 field techs + Dana; Dana's sister Marie does office admin on Mondays.
- New business arrives via phone, text, Facebook Messenger, and referrals.
- Existing tools: Google Calendar (tech schedules), QuickBooks (billing), a customer spreadsheet, a group text for daily dispatch.
- Off-the-shelf options exist in this category (Skimmer, Jobber, Housecall Pro). Part of discovery is establishing why custom — if there's no good answer, the right recommendation is "buy, don't build."

---

## The five core questions

Each question exists to de-risk something specific. The answer column drives requirements directly.

### Q1. "Walk me through yesterday — from the first customer message you saw to the last work thing you did before bed."

**Why this question:** Gets the *actual* workflow, not the imagined one. Owners describe their process aspirationally when asked directly; a narrated day exposes where information really lives and where it dies.
**De-risks:** Building for a fictional process.

**Dana's answer (D1):** First thing: 14 unread messages across text and FB Messenger — two repair requests, one cancellation, the rest "what day is my service?" Repair requests get copied into a note on her phone, then into the spreadsheet "when I get a minute" (one from last Tuesday never made it). Evening: rebuilt Thursday's route in Google Calendar because a repair got squeezed in, then group-texted the techs their stops.

**What this tells us:** The system of record is Dana's short-term memory. Intake loss is the top pain, not scheduling optimization. "What day is my service?" is a self-service question generating real interruption volume.

---

### Q2. "Where does the same piece of information get typed more than once?"

**Why this question:** Retyping points are the integration map. Every duplicate entry is either an automation target or a future sync bug.
**De-risks:** Automating the wrong step; missing a system that must stay in the loop.

**Dana's answer (D2):** Customer info gets typed into the spreadsheet, again into QuickBooks, again into Calendar event descriptions, and gate codes live in a *separate* note. Repair details get retyped from Messenger into the tech group text, and details get dropped ("tech shows up without the part because I forgot to say it's a Pentair pump").

**What this tells us:** One source of truth with projections outward, not another parallel tool. Gate codes / access notes are first-class data — a missing gate code is a failed visit.

---

### Q3. "What has to be true before you'll put a repair job on the calendar?"

**Why this question:** Elicits the qualification rules — the difference between a *request* and a *booking*. These rules become the intake schema, the AI triage output contract, and the status model.
**De-risks:** An intake form that collects the wrong fields; an AI triage layer with no target schema.

**Dana's answer (D3):** (a) It's a real address she serves — members yes, non-members only in three zip codes. (b) A symptom description good enough to bring the right parts. (c) Access confirmed — gate code or someone home, and "is the dog friendly" is not a joke. (d) A $75 deposit for non-plan repair visits — she started requiring it verbally after no-shows, but collects it inconsistently because it's awkward to ask.

**What this tells us:** Deposit collection is a *product* fix for a *social* problem — the system asks so Dana doesn't have to. Qualification rules are crisp enough to automate. Service-area check is a real rule, not polish.

---

### Q4. "How and when do you get paid, and where does that break today?"

**Why this question:** Payment model determines a third of the architecture. Also finds the scope trap: billing migrations are where SMB projects go to die.
**De-risks:** Accidentally signing up to migrate 280 QuickBooks autopay records in v1.

**Dana's answer (D4):** Monthly plans autopay through QuickBooks — "do not touch that, it works." Repairs are invoiced after the job, sometimes chased for weeks. The $75 deposit, when she remembers to collect it, comes by Zelle or cash.

**What this tells us:** **Scope cut, stated in the room:** v1 handles repair deposits via Stripe Checkout only; plan billing stays in QuickBooks untouched. Dana visibly relaxed when this was said — it also builds trust. Deposit → Stripe → automatic status change is the money path.

---

### Q5. "What do you need to be able to do from the truck, with wet hands, in under ten seconds?"

**Why this question:** Defines the owner's real interface. If the owner console requires a laptop, it won't be used, and the group text survives — meaning the project failed regardless of code quality.
**De-risks:** Building an admin dashboard nobody opens.

**Dana's answer (D5):** See today's stops. Get pinged when a new repair request comes in and approve it or ask for more info without calling anyone. She already lives in Telegram for a fishing group chat, so a bot there "would actually get looked at."

**What this tells us:** Telegram bot is the owner's front door — pings with inline approve / needs-info buttons, plus `/today` and `/week`. Airtable is the sit-down console (Marie on Mondays); Telegram is the field console.

---

## Extended questions (asked after the core five)

### Q6. "When something goes wrong — no-show, double-booked tech, angry member — what happens now?"
**De-risks:** Missing statuses and edge states; designing only the happy path.
**Dana (D6):** Double-bookings happen "maybe monthly" when a repair gets wedged into a full day. No-shows on repairs are the expensive failure. Cancellations arrive by text and sometimes don't reach the tech in time.
**Drives:** DB-level conflict prevention on tech schedules, `no_show` / `cancelled` statuses, cancellation notifications to Telegram, deposit expiry for unpaid holds.

### Q7. "Who else looks at or touches this information?"
**De-risks:** Wrong permission model.
**Dana (D7):** Marie (office, Mondays — needs to see everything, edits notes/status), techs (need their own day only; today they get it by text). No customer-facing staff.
**Drives:** Roles: owner/admin, office, member. Tech-facing day sheet is **v1.5**, not v1 — the group text works well enough to defer.

### Q8. "If a robot wrote the first reply to every new request, what would it need to know to not embarrass you?"
**Why:** The AI-guardrail question, asked in owner language. Elicits tone, escalation rules, and the human-review threshold without saying "confidence score."
**Dana (D8):** Never promise a time without her approval. Never quote a price. If it's not sure, say "Dana will text you shortly" — a wrong confident answer is worse than a slow one.
**Drives:** AI triage classifies and drafts, never commits schedule or price. Confidence-gated: low-confidence → `needs_review` queue + honest holding reply. This answer is effectively the AI product spec.

### Q9. "What would make you quit using this after two weeks?"
**Why:** Adoption risk stated by the adopter. The failure mode of SMB tooling is abandonment, not bugs.
**Dana (D9):** "If it's more work than the group text." If she has to log into a website to approve a job, she won't.
**Drives:** Every owner action possible from Telegram. Airtable Interface for Marie must be usable with zero training. Success metric: Dana-side actions ≤ 2 taps.

---

## What was deliberately *not* asked (amateur anti-patterns)

- **"What features do you want?"** — Produces a wishlist, not a problem map. Features were proposed back to Dana only after Q1–Q9, mapped to her own words.
- **Technology questions in owner language.** "Do you want webhooks?" is condescension with extra steps. The JD's bar — plain English, no condescension — means the owner never hears a tool name unless she raises one.
- **Committing to a timeline in the room.** The correct close: "You'll have a written plan Tuesday with what's in v1, what's not, and why." The non-goals conversation happens in writing, where scope cuts are legible.
- **Skipping the money question.** Amateurs find it awkward and design payment flows on assumptions. Q4 is the highest-leverage question on the list.
- **Promising to replace QuickBooks / Calendar on day one.** Rip-and-replace stalls SMB projects. v1 sits *beside* the tools that work and replaces only what's broken.

---

## Buy-vs-build check (asked internally, answered honestly)

Skimmer / Jobber / Housecall Pro cover scheduling and invoicing well. The custom case rests on three things Dana actually said: (1) member self-service + AI-drafted first response to kill the "what day is my service?" interruption load, (2) Telegram-native owner approvals, (3) keeping QuickBooks rather than migrating billing into a suite. If those three didn't exist, the recommendation would be "buy Skimmer." That reasoning is preserved in the PRD's competitive context — a reviewer should see that build-vs-buy was a decision, not a reflex.

---

## Discovery → requirements traceability

| Discovery answer | Drives requirement(s) |
|---|---|
| D1 — intake lost across channels; "what's my service day" volume | R1 (member portal + intake), R2 (AI triage), R5 (pipeline: nothing dropped) |
| D2 — quadruple data entry; gate codes stranded | R3 (single source of truth, access notes on property), R6 (Airtable as projection, not second SoT) |
| D3 — qualification rules; inconsistent deposits | R2 (triage schema), R4 (Stripe deposit), R3 (status model incl. `awaiting_deposit`) |
| D4 — QuickBooks untouchable; repairs = money path | R4 (Checkout + webhook-authoritative status); Non-goal NG1 (no billing migration) |
| D5 — truck-first owner UX; Telegram habit | R7 (Telegram bot: pings, approve/needs-info, /today) |
| D6 — double-bookings; no-shows; cancellations | R3 (DB exclusion constraint, full status set), R5 (cancellation notifications), R4 (deposit expiry) |
| D7 — Marie's Monday admin; techs read-only | R6 (Airtable interface + roles); v1.5 item (tech day sheet) |
| D8 — AI must not promise, price, or bluff | R2 (confidence gate, draft-not-commit, holding reply) |
| D9 — "more work than the group text" = abandonment | R7 (≤2-tap owner actions), success metric M4 |
