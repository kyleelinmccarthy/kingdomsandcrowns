import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { stripeClient, stripeCryptoProvider } from "@/lib/billing/stripe";
import type { SubscriptionStatus } from "@/lib/billing/plan";
import { BILLING_ENABLED } from "@/lib/billing/config";

/** Stripe's subscription statuses, narrowed to the five we actually distinguish on. Payment
 *  trouble (incomplete/unpaid) reads as past_due; a dead subscription (incomplete_expired/paused)
 *  reads as canceled — never as "free", so a family's lapse is always visible on the row rather
 *  than silently indistinguishable from never having subscribed. */
function toSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "incomplete":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "past_due";
  }
}

async function upsertFromSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const familyId = subscription.metadata?.familyId;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;
  const status = toSubscriptionStatus(subscription.status);
  const now = new Date();

  const existing = await db
    .select({ id: schema.subscription.id })
    .from(schema.subscription)
    .where(eq(schema.subscription.stripeCustomerId, customerId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.subscription)
      .set({ stripeSubscriptionId: subscription.id, status, priceId, currentPeriodEnd, updatedAt: now })
      .where(eq(schema.subscription.id, existing[0].id));
    return;
  }

  if (!familyId) {
    console.error("[stripe webhook] no existing row for customer and no familyId metadata:", customerId);
    return;
  }
  await db.insert(schema.subscription).values({
    id: nanoid(),
    familyId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status,
    priceId,
    currentPeriodEnd,
    createdAt: now,
    updatedAt: now,
  });
}

async function markByCustomerId(customerId: string, status: SubscriptionStatus) {
  await db
    .update(schema.subscription)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.subscription.stripeCustomerId, customerId));
}

export async function POST(request: NextRequest) {
  if (!BILLING_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      stripeCryptoProvider
    );
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
        await upsertFromSubscription(subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await markByCustomerId(customerId, "canceled");
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (typeof invoice.customer === "string") {
        await markByCustomerId(invoice.customer, "past_due");
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
