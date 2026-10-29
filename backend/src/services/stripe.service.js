
import Stripe from "stripe";

let stripeClient;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    const error = new Error("Stripe credentials are not configured.");
    error.statusCode = 503;
    throw error;
  }

  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    const error = new Error("Stripe secret key format is invalid.");
    error.statusCode = 503;
    throw error;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      maxNetworkRetries: 2,
    });
  }

  return stripeClient;
}

export function resetStripeClientForTests() {
  stripeClient = undefined;
}
