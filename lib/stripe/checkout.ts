// lib/stripe/checkout.ts
// Hosted Checkout Session creator (R4 / ADR-03).
// The webhook (supabase/functions/stripe-webhook) is the payment authority;
// this module only opens the session. The success_url redirect is cosmetic.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export interface CreateCheckoutSessionArgs {
  bookingId: string;
  origin: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

/**
 * Create a Stripe Checkout Session for a repair deposit (fixed $75).
 * The webhook verifies payment and transitions the booking after money confirms.
 * @throws Error if session.url is null (Stripe API failure).
 */
export async function createDepositCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<CheckoutSessionResult> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 7500, // $75.00 in cents
          product_data: {
            name: "Sailfish Pool Care — repair deposit",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      booking_id: args.bookingId,
    },
    success_url: `${args.origin}/request/${args.bookingId}?paid=1`,
    cancel_url: `${args.origin}/request/${args.bookingId}`,
  });

  if (!session.url) {
    throw new Error(`Stripe Checkout session created but url is null [${session.id}]`);
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}
