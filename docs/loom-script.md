# Loom shooting script — 90 seconds

Seven beats, ~90s total. One take is fine; the system does the talking.
Prep: portal open on your phone (or a narrow browser window), Telegram open,
Airtable Interface open, the chaos log in an editor tab.

| # | ~sec | On screen | Say (roughly) |
|---|---|---|---|
| 1 | 0–15 | Portal on a phone: type a messy repair request ("pump's making a grinding noise and won't prime"), submit | "A member describes the problem in their own words — no forms shaped like our database." |
| 2 | 15–30 | The status page that lands: AI acknowledgment + deposit card | "Claude Haiku triaged it — classified, confidence-gated, and structurally unable to promise a price or a time. Qualified repairs go straight to a deposit." |
| 3 | 30–45 | Pay with `4242 4242 4242 4242` → "Confirming your payment…" → it flips to **Scheduled on its own** within ~3s (the page polls — don't touch it) | "Stripe Checkout, webhook-authoritative — the redirect is cosmetic; the page just watches until the verified event lands. Replays can't double-book it; we proved that by replaying them." |
| 4 | 45–55 | Telegram: the booking ping → tap **Approve** → "✅ Approved" | "Dana approves from the truck. One tap. Double-taps no-op — there's exactly one audit row." |
| 5 | 55–70 | Airtable Interface: the week by tech, tick **mark_completed** on a confirmed job, show status flip | "The office runs the week from an Airtable projection. Two whitelisted fields write back through a guarded edge function — Supabase stays the only source of truth." |
| 6 | 70–85 | The chaos log (`scripts/chaos/runs/cx20260706T2052.log`), scroll the four PASS lines | "Fifty bookings while we killed the pipeline, broke Airtable auth, and replayed Stripe events: zero lost, zero duplicated, and every failure alerted. The log is committed." |
| 7 | 85–90 | README failure-modes table | "Every integration, how it fails, how we *detect* it. That table is the point of the build." |

After recording: paste the Loom URL into the README's status paragraph
(one-line PR or direct commit to main).
