// lib/triage/schema.ts
// The AI's entire contract, in one file (R2 / ADR-08). The prompt asks for
// this shape; zod enforces it; the golden set asserts behavior against it;
// bookings.triage stores exactly this JSON. One schema, four consumers.

import { z } from "zod";

export const ServiceType = z.enum([
  "repair",
  "one_off_clean",
  "plan_question",
  "cancellation",
  "complaint",
  "access_update",
  "other",
]);
export type ServiceType = z.infer<typeof ServiceType>;

export const TriageResult = z.object({
  service_type: ServiceType,
  urgency: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1).max(280),
  equipment: z.array(z.string()).default([]),     // e.g. "Pentair SuperFlo VS"
  symptoms: z.array(z.string()).default([]),
  access_flags: z.array(z.string()).default([]),  // e.g. "dog", "gate code changing Monday"
  in_service_area: z.boolean().nullable(),        // null = address unknown from message
  confidence: z.number().min(0).max(1),
  member_ack_draft: z.string().min(1).max(600),
});
export type TriageResult = z.infer<typeof TriageResult>;

// Routing policy (deliberately conservative — D8):
// only work orders can auto-qualify; questions, cancellations, complaints,
// and access updates always get a human. Structural, not prompt-dependent.
export const AUTO_QUALIFY_TYPES: ReadonlySet<ServiceType> = new Set([
  "repair",
  "one_off_clean",
]);

export const CONFIDENCE_THRESHOLD = 0.8; // tunable; lowering it is a product decision

export type TriageRoute = "auto_qualified" | "needs_review";

export function routeFor(result: TriageResult): TriageRoute {
  if (!AUTO_QUALIFY_TYPES.has(result.service_type)) return "needs_review";
  if (result.confidence < CONFIDENCE_THRESHOLD) return "needs_review";
  if (result.in_service_area === false) return "needs_review"; // out-of-area gets a human + kind decline draft
  return "auto_qualified";
}

// Phrases the ack draft must never contain in commitment form. The real
// guarantee is structural (no code path lets the model schedule or price —
// ADR-08); these string checks are the tripwire layer used by the golden set.
export const FORBIDDEN_COMMITMENTS = [
  /\$\s?\d/,                                  // any dollar amount
  /\b(confirmed|booked|scheduled) (for|on|at)\b/i,
  /\bsee you (at|on)\b/i,
  /\bwe('|)ll be there\b/i,
  /\bfree (visit|repair|service)\b/i,
] as const;
