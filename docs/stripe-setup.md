# Stripe Setup — Billing

> **Status: coming soon.** Paid plans are fully built but switched off (`BILLING_ENABLED = false` in [src/lib/billing/config.ts](../src/lib/billing/config.ts)). While off, every family has every feature, Settings shows "Kingdom plan — coming soon", and the checkout, portal and webhook endpoints are closed. Nothing in this guide is needed until you launch: finish these steps, then flip that one line to `true`.

Kingdoms & Crowns gates a handful of features (more than 1 hero, more than 1 adult account, saving a weekly summary) behind a paid "Kingdom" plan, billed through Stripe Checkout and managed through the Stripe Customer Portal. This guide walks through everything needed to make `src/lib/actions/billing.ts` and `src/app/api/webhooks/stripe/route.ts` work.

## Environment Variables

Add the following to your `.env.local` (and to the Vercel project's Production environment variables — see [deploy-vercel.md](./deploy-vercel.md)):

```env
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_MONTHLY=price_your_monthly_price_id
STRIPE_PRICE_YEARLY=price_your_yearly_price_id
```

Everything below explains where each of these four values comes from.

---

## 1. Create a Stripe account

1. Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. You land in **test mode** by default (toggle top-right) — do all of the following in test mode first. Nothing here touches real money until you flip to live mode and repeat steps 2–4 with live keys.

## 2. Create the product and its two prices

1. **Product catalog → + Add product.**
2. Name it (e.g. "Kingdom Plan"). Description optional.
3. Under **Pricing**, add a **Recurring** price:
   - Monthly, e.g. $7.99/mo.
   - Click **Save**, then **+ Add another price** for the yearly option: Recurring, Yearly, e.g. $69/yr.
4. Open each price and copy its id (starts `price_...`) into `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`. These are the only two values the app needs — it never hardcodes an amount, so you can change pricing later in the Stripe dashboard without a code change.

## 3. Get your API key

**Developers → API keys → Secret key** (starts `sk_test_...` in test mode). Set as `STRIPE_SECRET_KEY`.

Never put this in `NEXT_PUBLIC_*` or commit it — it's server-only, used in `src/lib/billing/stripe.ts`.

## 4. Configure the Customer Portal

The "Manage billing" button (`createBillingPortalSession` in `billing.ts`) redirects to Stripe's hosted Customer Portal. Stripe requires it to be configured at least once before the API will create a session:

1. **Settings → Billing → Customer portal.**
2. Turn on **Cancel subscriptions** and **Update payment method** at minimum. Switching plans (monthly ↔ yearly) is also worth enabling.
3. Save.

You'll repeat this once for test mode and once for live mode — the two are configured separately.

## 5. Set up the webhook

The app's webhook handler lives at `/api/webhooks/stripe` and needs these four events:
`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` (it also handles `customer.subscription.created`, same as `updated`).

1. **Developers → Webhooks → + Add endpoint.**
2. Endpoint URL: `https://kingdomsandcrowns.com/api/webhooks/stripe` (your real domain once deployed — see step 6 for local testing before you have one).
3. Select the events listed above (or just select all `customer.subscription.*` plus `checkout.session.completed` and `invoice.payment_failed`).
4. After creating it, click into the endpoint and reveal its **Signing secret** (starts `whsec_...`). Set as `STRIPE_WEBHOOK_SECRET`.

## 6. Local testing with the Stripe CLI

Before you have a public URL, use the CLI to forward events to your dev server:

```bash
brew install stripe/stripe-cli/stripe   # or see stripe.com/docs/stripe-cli for other OSes
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints its own `whsec_...` — use that one in `.env.local` while testing locally instead of the dashboard endpoint's secret (they're different, since this is a separate, CLI-managed endpoint).

With that running, go through a real checkout in your browser (Settings → Upgrade). Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC. You should see the webhook events land in the `stripe listen` output and the family's `subscription` row update (`status` → `active`).

You can also fire individual events without a real checkout:

```bash
stripe trigger checkout.session.completed
```

## 7. Going live

1. Toggle to **live mode** in the Stripe dashboard.
2. Repeat steps 2–5 in live mode (product/prices, Customer Portal config, webhook endpoint pointed at your real production domain) — test-mode and live-mode objects are entirely separate; nothing carries over automatically.
3. Swap all four values in Vercel for their live-mode values (`sk_live_...`, live `price_...` ids, live webhook's `whsec_...`).

---

## What each env var is used for, in code

| Var | Used in |
|---|---|
| `STRIPE_SECRET_KEY` | `src/lib/billing/stripe.ts` — the Stripe SDK client |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | `src/lib/billing/stripe.ts` → `priceIdForInterval()`, used by `createCheckoutSession` in `src/lib/actions/billing.ts` |
| `STRIPE_WEBHOOK_SECRET` | `src/app/api/webhooks/stripe/route.ts` — verifies the webhook signature before trusting any event |

If any of these are unset, the relevant code throws a clear error (`"STRIPE_SECRET_KEY is not set."` etc.) rather than failing silently — you'll see it immediately if a step above was missed.
