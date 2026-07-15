import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";
import { hasPremiumAccess } from "@/lib/plans";
import { stripeClient } from "@/lib/stripe";

export async function POST() {
  try {
    const session = await currentUser();
    if (!session) return apiError("Sign in to upgrade.", 401);
    if (!env.PREMIUM_ENABLED) return apiError("Premium subscriptions are not on sale yet.", 503);
    if (hasPremiumAccess(session.user)) return apiError("This account already has Premium.", 409);
    const stripe = stripeClient();
    if (!stripe || !env.STRIPE_PREMIUM_PRICE_ID) return apiError("Premium checkout is not configured yet.", 503);
    let customerId = session.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: session.user.email, metadata: { userId: session.user.id } });
      customerId = customer.id;
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, session.user.id));
    }
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      client_reference_id: session.user.id,
      metadata: { userId: session.user.id },
      subscription_data: { metadata: { userId: session.user.id } },
      success_url: `${env.APP_URL}/account?billing=success`,
      cancel_url: `${env.APP_URL}/pricing?billing=cancelled`,
    });
    if (!checkout.url) return apiError("Stripe did not return a checkout URL.", 502);
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error(JSON.stringify({ event: "billing.checkout.failed", error: errorMessage(error) }));
    return apiError("Could not start checkout.", 500);
  }
}
