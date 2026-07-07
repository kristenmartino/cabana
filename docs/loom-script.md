# Loom shooting script — 90 seconds

Seven beats, ~90s total. One take is fine; the system does the talking.
Prep: portal open on your phone (or a narrow browser window), Telegram open,
Airtable Interface open, the chaos log in an editor tab.

## Pre-flight (do this in the 10 minutes before recording)

The demo runs against the live cloud stack, which has two documented soft spots
— walk through them once so the take is clean:

1. **Dry-run one full booking end-to-end** (portal → pay `4242…` → Telegram
   ping → Approve → Airtable) minutes before the take. If the Telegram ping is
   slow, that's the Railway↔Telegram flake ([#20](https://github.com/kristenmartino/cabana/issues/20));
   it clears on retry — just start the real take once you've seen one land promptly.
2. **Beat 5 needs a *confirmed* booking visible in the Interface.** The booking
   you create in beats 1–4 has no tech/window, so it won't appear in "This Week
   by Tech." Decide your beat-5 target ahead of time — either point the camera at
   a seeded confirmed booking that has a window, or ask the operator to give the
   just-approved booking a tech + window between beats 4 and 5. Don't discover
   this on camera.
3. **Confirm the demo member reads clean**: the home page greets by name (should
   be a fictional name), and the booking list should be tidy (no duplicate
   test requests). Sign in once and look before you record.
4. **Airtable Interface**: open the exact screen you'll film and confirm rows
   show real names/addresses (not UUIDs or blanks) — old rows projected before
   the enrichment landed may need a touch to re-project.

## The beats

| # | ~sec | On screen | Say (roughly) |
|---|---|---|---|
| 1 | 0–15 | Portal on a phone: type a **fresh, messy** repair — e.g. *"salt cell's reading zero and the returns are barely pushing water"* — submit *(anything not lifted from the docs/tests, so it's visibly not staged)* | "A member describes the problem in their own words — no forms shaped like our database." |
| 2 | 15–30 | The status page: the **AI-drafted acknowledgment card** ("Triaged" — a warm, specific reply) above the **deposit card** | "Claude Haiku triaged it — classified, confidence-gated, and structurally unable to promise a price or a time. Qualified repairs go straight to a deposit." |
| 3 | 30–45 | Pay with `4242 4242 4242 4242` → "Confirming your payment…" → it flips to **Scheduled on its own** within ~3s (the page polls — don't touch it; if the webhook beats the redirect you land straight on Scheduled, which proves the point even harder) | "Stripe Checkout, webhook-authoritative — the redirect is cosmetic; the page just watches until the verified event lands. Replays can't double-book it; we proved that by replaying them." |
| 4 | 45–55 | Telegram: the booking ping → tap **Approve** → "✅ Approved" *(don't tap "Needs info" — it's a v1 acknowledge-only stub)* | "Dana approves from the truck. One tap. Double-taps no-op — there's exactly one audit row." |
| 5 | 55–70 | Airtable Interface: the week by tech, tick **mark_completed** on a confirmed job, show the status flip | "The office runs the week from an Airtable projection. Two whitelisted fields write back through a guarded edge function — Supabase stays the only source of truth." |
| 6 | 70–85 | The chaos log (`scripts/chaos/runs/cx20260706T2052.log`), scroll the four PASS lines | "Fifty bookings while we killed the pipeline, broke Airtable auth, and replayed Stripe events: zero lost, zero duplicated, and every failure alerted. The log is committed." |
| 7 | 85–90 | README failure-modes table | "Every integration, how it fails, how we *detect* it. That table is the point of the build." |

After recording: paste the Loom URL into the README's status paragraph
(one-line PR or direct commit to main).
