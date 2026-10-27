import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazily constructed so the module never crashes at import time if Stripe isn't configured yet.
 *  Fetch-based HTTP client: Cloudflare Workers has no `node:https`. */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!client) client = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return client;
}

/** Workers only exposes async (SubtleCrypto) HMAC, so webhook signatures are checked with it. */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

export type BillingInterval = "monthly" | "yearly";

export function priceIdForInterval(interval: BillingInterval): string {
  const id =
    interval === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  if (!id) throw new Error(`STRIPE_PRICE_${interval === "monthly" ? "MONTHLY" : "YEARLY"} is not set.`);
  return id;
}
