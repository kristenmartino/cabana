# Portfolio assets for Cabana

Source assets for the Cabana case study on **kristenmartino.ai**. They live here —
versioned alongside the system they describe — and are meant to be copied into the
portfolio site. Nothing here is committed automatically; it's yours to move.

## Files

| File | What it is |
|---|---|
| [`case-study.mdx`](case-study.mdx) | The full case-study page copy — frontmatter (title, summary, `category: "Applied AI · Ops Systems"`, stack, link placeholders) + the page body: hero, TL;DR, context, demo beats, architecture, four load-bearing ADRs, the reliability/chaos/evidence section, honest notes, and a "run it yourself" block. |
| [`architecture.svg`](architecture.svg) | Theme-aware system diagram (faithful to `docs/02-architecture.md` §1). Adapts to light/dark via both `prefers-color-scheme` **and** `:root[data-theme=...]`, matching how the site toggles theme. Self-contained, no external fonts/images. |
| [`screenshot-captions.md`](screenshot-captions.md) | The 14-frame annotated screenshot strip — what to capture, suggested filenames, and the exact caption for each (each ties a frame to the invariant behind it). |

## Before publishing — checklist

- [ ] **Record the 90s Loom** (`docs/loom-script.md`) → replace `TODO_LOOM_URL` in the frontmatter and the two `<!-- LOOM_EMBED -->` markers in the body.
- [ ] **Set `TODO_REPO_URL`** to the public GitHub URL. Confirm the repo is **public** and every referenced file path resolves — a 404 on an evidence link does outsized damage on an honesty-branded page.
- [ ] **Capture the 14 screenshots** from the local seeded app (filenames in `screenshot-captions.md`). Phone-width for the portal frames. Re-project any stale Airtable rows first (no UUIDs/blanks).
- [ ] **Tag `v1.0`** and run the clean-clone stopwatch once. Then relax the "ship-out pending" language in the hero, the M1 evidence row, and the "Ship-out still pending" honest note — the copy is deliberately hedged until those are real.
- [ ] **Fix link targets for the web.** The MDX uses repo-relative paths (`docs/...`, `scripts/...`) so it reads correctly in-repo. When embedding on the site, rewrite them to `https://github.com/<you>/cabana/blob/v1.0/<path>`.
- [ ] **Reconcile the golden number** if you cite one: the copy says 20/20, 100% containment (a result from a finite test set at temperature 0). Confirm against the current CI run, or fall back to the non-numeric "≥90%, 100% containment."

## Honesty guardrails (keep these when editing)

An adversarial fact-check pass ran over the copy against the repo. It deliberately
avoids the claims that would backfire on an honesty-branded page:

- not "production-grade / battle-tested" → "demonstrates production-shaped patterns"
- not "shipped v1.0 / all gates closed" → "gates 1–3a closed; ship-out pending"
- not "no real PII anywhere" → "no client or third-party PII; all member data fabricated"
- the chaos **p95 (~41 min) is a durability datapoint, never a latency/perf number** — it folds in a ~25-min injected outage
- bug **#23** (dead-letter not terminal) is surfaced by the copy itself, not hidden
- AI routing is limited to review or a deposit request; free-text drafts may be incorrect and are kept off member status pages

If you add a claim, source it to a committed file or cut it.
