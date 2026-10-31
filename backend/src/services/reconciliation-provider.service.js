import { getRazorpayClient } from "./razorpay.service.js";
import { getStripeClient } from "./stripe.service.js";

const MAX_PROVIDER_RECORDS = 5000;

function validatePeriod(start, end) {
  const periodStart = new Date(start);
  const periodEnd = new Date(end);

  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart >= periodEnd
  ) {
    throw new Error("Invalid reconciliation date range");
  }

  const maxRangeMs = 31 * 24 * 60 * 60 * 1000;

  if (periodEnd - periodStart > maxRangeMs) {
    throw new Error("Reconciliation range cannot exceed 31 days");
  }

  return { periodStart, periodEnd };
}

export async function fetchRazorpayTransactions({ start, end }) {
  const { periodStart, periodEnd } = validatePeriod(start, end);
  const razorpay = getRazorpayClient();

  const from = Math.floor(periodStart.getTime() / 1000);
  const to = Math.floor(periodEnd.getTime() / 1000);

  const transactions = [];
  let skip = 0;
  const pageSize = 100;

  while (transactions.length < MAX_PROVIDER_RECORDS) {
    const result = await razorpay.payments.all({
      from,
      to,
      count: pageSize,
      skip,
    });

    const items = result.items ?? [];

    transactions.push(
      ...items.map((payment) => ({
        provider: "razorpay",
        reference: payment.id,
        orderReference: payment.order_id ?? null,
        amount: payment.amount,
        currency: String(payment.currency ?? "").toUpperCase(),
        status: payment.status,
        captured: Boolean(payment.captured),
        createdAt: new Date(payment.created_at * 1000),
      }))
    );

    if (items.length < pageSize) {
      break;
    }

    skip += items.length;
  }

  if (transactions.length >= MAX_PROVIDER_RECORDS) {
    throw new Error(
      "Razorpay reconciliation exceeded the record limit. Use a smaller date range."
    );
  }

  return transactions;
}

export async function fetchStripeTransactions({ start, end }) {
  const { periodStart, periodEnd } = validatePeriod(start, end);
  const stripe = getStripeClient();

  const created = {
    gte: Math.floor(periodStart.getTime() / 1000),
    lt: Math.floor(periodEnd.getTime() / 1000),
  };

  const transactions = [];

  for await (const intent of stripe.paymentIntents.list({
    created,
    limit: 100,
  })) {
    transactions.push({
      provider: "stripe",
      reference: intent.id,
      orderReference: null,
      amount: intent.amount,
      currency: String(intent.currency ?? "").toUpperCase(),
      status: intent.status,
      captured: intent.status === "succeeded",
      createdAt: new Date(intent.created * 1000),
    });

    if (transactions.length >= MAX_PROVIDER_RECORDS) {
      throw new Error(
        "Stripe reconciliation exceeded the record limit. Use a smaller date range."
      );
    }
  }

  return transactions;
}
