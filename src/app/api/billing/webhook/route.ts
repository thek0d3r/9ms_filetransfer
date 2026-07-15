import Stripe from "stripe";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityEvents, stripeEvents, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

function periodEnd(subscription: Stripe.Subscription) {
  const seconds = Math.max(0, ...subscription.items.data.map((item) => item.current_period_end));
  return seconds ? new Date(seconds * 1000) : null;
}

async function subscriptionFromEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.type.startsWith("customer.subscription.")) return event.data.object as Stripe.Subscription;
  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object as Stripe.Checkout.Session;
    if (typeof checkout.subscription === "string") return stripe.subscriptions.retrieve(checkout.subscription);
  }
  return null;
}

export async function POST(request: Request) {
  const stripe = stripeClient();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return apiError("Webhook is not configured.", 503);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return apiError("Missing signature.", 400);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return apiError("Invalid webhook signature.", 400);
  }
  try {
    const subscription = await subscriptionFromEvent(event, stripe);
    if (!subscription) return NextResponse.json({ received: true });
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const userId = subscription.metadata.userId;
    const active = ["active", "trialing"].includes(subscription.status);
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
      if (!inserted.length) return;
      const [user] = await tx.update(users).set({
        plan: active ? "premium" : "free",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPeriodEnd: periodEnd(subscription),
      }).where(userId ? or(eq(users.stripeCustomerId, customerId), eq(users.id, userId)) : eq(users.stripeCustomerId, customerId)).returning({ id: users.id });
      if (user) await tx.insert(activityEvents).values({
        userId: user.id,
        action: active ? "billing.premium_enabled" : "billing.premium_disabled",
        metadata: JSON.stringify({ status: subscription.status, eventId: event.id }),
      });
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "billing.webhook.failed", error: errorMessage(error) }));
    return apiError("Webhook processing failed.", 500);
  }
}
