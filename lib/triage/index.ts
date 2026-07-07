// lib/triage/index.ts
// Calls Claude Haiku with a hard 2s budget, validates with zod, and NEVER
// throws into the member flow: every failure mode returns a needs_review
// result. The AI layer's floor is "a human will look at this" — the exact
// pre-Cabana baseline (R2 / ADR-08).
//
// STATUS: Day-5 skeleton. The control flow and logging contract are final;
// the Anthropic call is marked TODO pending Day-1 dependency verification.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TriageResult,
  routeFor,
  type TriageRoute,
} from "./schema";

export const PROMPT_VERSION = "triage/v2";
// Production SLA is 2s: a slow model call must fall back to needs_review, not
// stall the member's intake. CI overrides this (TRIAGE_TIMEOUT_MS) so the
// golden gate measures the classifier's *routing*, not Anthropic's tail latency
// on a given day — a slow-but-correct classification would otherwise fall back
// and read as a routing regression (#25). Unset everywhere but CI.
const TIMEOUT_MS = Number(process.env.TRIAGE_TIMEOUT_MS) || 2000;
const MODEL = "claude-haiku-4-5-20251001"; // small-model task by design (ADR-08)

export type TriageOutcome = {
  route: TriageRoute;
  result: TriageResult | null;
  aiEvent: {
    prompt_version: string;
    input: string;
    raw_output: string | null;
    parsed: TriageResult | null;
    confidence: number | null;
    outcome: "auto_qualified" | "needs_review" | "validation_failed" | "timeout";
    latency_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
  };
};

export type MemberContext = {
  memberName: string;
  properties: Array<{ address: string; zip: string; inServiceArea: boolean }>;
  planDayLabel: string | null; // e.g. "Tuesdays"
  serviceZips: string[]; // from service_zips — the business rule, not hardcoded
};

const FALLBACK_ACK =
  "Thanks for reaching out — we received your message. Dana will text you shortly to sort out the details.";

function buildPrompt(message: string, ctx: MemberContext): string {
  // Read the prompt file named by PROMPT_VERSION ("triage/v2" -> v2.md) so the
  // template and the version stamped into ai_events can never drift apart.
  const version = PROMPT_VERSION.split("/")[1];
  const template = readFileSync(
    join(process.cwd(), "prompts", "triage", `${version}.md`),
    "utf-8",
  );
  return template
    .replace("{{MEMBER_NAME}}", ctx.memberName)
    .replace("{{PLAN_DAY}}", ctx.planDayLabel ?? "unknown")
    .replace(
      "{{PROPERTIES}}",
      ctx.properties
        .map((p) => `- ${p.address} (zip ${p.zip}, in service area: ${p.inServiceArea})`)
        .join("\n"),
    )
    .replace("{{SERVICE_ZIPS}}", ctx.serviceZips.join(", "))
    .replace("{{MESSAGE}}", message);
}

export async function triageIntake(
  message: string,
  ctx: MemberContext,
): Promise<TriageOutcome> {
  const started = Date.now();
  const input = buildPrompt(message, ctx);

  const needsReview = (
    outcome: "needs_review" | "validation_failed" | "timeout",
    raw: string | null = null,
  ): TriageOutcome => ({
    route: "needs_review",
    result: null,
    aiEvent: {
      prompt_version: PROMPT_VERSION,
      input,
      raw_output: raw,
      parsed: null,
      confidence: null,
      outcome,
      latency_ms: Date.now() - started,
      input_tokens: null,
      output_tokens: null,
    },
  });

  try {
    const client = new Anthropic(); // ANTHROPIC_API_KEY from env, server-side only
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1000,
        temperature: 0, // triage is a classifier: same message -> same routing.
        // Default temp (1.0) let confidence swing run-to-run and flip borderline
        // cases across the 0.8 auto-qualify gate — non-deterministic triage AND a
        // flaky golden set. 0 makes both reproducible.
        messages: [{ role: "user", content: input }],
      },
      { timeout: TIMEOUT_MS },
    );

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = TriageResult.safeParse(JSON.parse(cleaned));
    if (!parsed.success) return needsReview("validation_failed", raw);

    const route = routeFor(parsed.data);
    return {
      route,
      result: parsed.data,
      aiEvent: {
        prompt_version: PROMPT_VERSION,
        input,
        raw_output: raw,
        parsed: parsed.data,
        confidence: parsed.data.confidence,
        outcome: route,
        latency_ms: Date.now() - started,
        input_tokens: response.usage?.input_tokens ?? null,
        output_tokens: response.usage?.output_tokens ?? null,
      },
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && /timeout|timed out|abort/i.test(err.message);
    return needsReview(isTimeout ? "timeout" : "validation_failed");
  }
}

// The caller (server action) is responsible for:
//   1. insert booking with status per route:
//        auto_qualified + repair          -> 'awaiting_deposit' (+ Checkout session)
//        auto_qualified + one_off_clean   -> 'needs_review' (Dana ping w/ Approve —
//                                            "auto_qualified" here only changes the
//                                            ack copy; time promises are Dana's, D8)
//        needs_review (any reason)        -> 'needs_review'
//   2. insert aiEvent into ai_events verbatim
//   3. show result?.member_ack_draft ?? FALLBACK_ACK
export { FALLBACK_ACK };
