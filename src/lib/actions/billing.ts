"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireFamilyAccess } from "@/lib/auth/access";
import { requireSession } from "@/lib/auth/session";
import { stripeClient, priceIdForInterval, type BillingInterval } from "@/lib/billing/stripe";
import { getSubscriptionStatus } from "@/lib/billing/plan";
import { BILLING_ENABLED } from "@/lib/billing/config";
import { appBaseUrl } from "@/lib/email";

// Server actions are reachable by POST whether or not any button renders them, so the pre-launch
// switch is enforced here too, not only in the UI.
function assertBillingLive() {
  if (!BILLING_ENABLED) throw new Error("Paid plans aren't available yet.");
}

function assertOwner(access: { isOwner: boolean }) {
  if (!access.isOwner) {
    throw new Error("Only the family owner can manage billing.");
  }
}

export async function getBillingStatus() {
  const access = await requireFamilyAccess();
  return {
    enabled: BILLING_ENABLED,
    status: BILLING_ENABLED ? await getSubscriptionStatus(access.familyId) : ("free" as const),
    canManage: access.isOwner,
  };
}

async function getOrCreateStripeCustomerId(
  familyId: string,
  email: string,
  familyName: string
): Promise<string> {
  const rows = await db
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.familyId, familyId))
    .limit(1);
  const existing = rows[0];
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripeClient().customers.create({
    email,
    name: familyName,
    metadata: { familyId },
  });

  const now = new Date();
  if (existing) {
    await db
      .update(schema.subscription)
      .set({ stripeCustomerId: customer.id, updatedAt: now })
      .where(eq(schema.subscription.id, existing.id));
  } else {
    await db.insert(schema.subscription).values({
      id: nanoid(),
      familyId,
      stripeCustomerId: customer.id,
      status: "free",
      createdAt: now,
      updatedAt: now,
    });
  }
  return customer.id;
}

/** Redirects the owner to Stripe-hosted Checkout for a new subscription. */
export async function createCheckoutSession(interval: BillingInterval): Promise<never> {
  assertBillingLive();
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);
  const session = await requireSession();

  const customerId = await getOrCreateStripeCustomerId(
    access.familyId,
    session.user.email,
    access.familyName
  );

  const checkoutSession = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForInterval(interval), quantity: 1 }],
    success_url: `${appBaseUrl()}/settings?checkout=success`,
    cancel_url: `${appBaseUrl()}/settings?checkout=cancelled`,
    client_reference_id: access.familyId,
    subscription_data: { metadata: { familyId: access.familyId } },
  });

  if (!checkoutSession.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(checkoutSession.url);
}

/** Redirects the owner to the Stripe-hosted Customer Portal (cancel, change plan, update card). */
export async function createBillingPortalSession(): Promise<never> {
  assertBillingLive();
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);

  const rows = await db
    .select({ stripeCustomerId: schema.subscription.stripeCustomerId })
    .from(schema.subscription)
    .where(eq(schema.subscription.familyId, access.familyId))
    .limit(1);
  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) throw new Error("No billing account yet — upgrade first.");

  const portalSession = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBaseUrl()}/settings`,
  });

  redirect(portalSession.url);
}
