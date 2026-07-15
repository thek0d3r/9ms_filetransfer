import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";

export async function POST() {
  try {
    const session = await currentUser();
    if (!session) return apiError("Sign in first.", 401);
    const stripe = stripeClient();
    if (!stripe || !session.user.stripeCustomerId) return apiError("No billing account is available.", 404);
    const portal = await stripe.billingPortal.sessions.create({ customer: session.user.stripeCustomerId, return_url: `${env.APP_URL}/account` });
    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error(JSON.stringify({ event: "billing.portal.failed", error: errorMessage(error) }));
    return apiError("Could not open billing settings.", 500);
  }
}
