import mongoose from "mongoose";

import { Payment } from "../models/payment.model.js";
import { ReconciliationRun } from "../models/reconciliation-run.model.js";

import {
  fetchRazorpayTransactions,
  fetchStripeTransactions,
} from "./reconciliation-provider.service.js";

const MAX_LOCAL_RECORDS = 5000;

function normalizeReference(value) {
  return value ? String(value).trim() : null;
}

function getLocalStatus(payment) {
  return payment.status === "captured" ? "captured" : payment.status;
}

function getProviderStatus(remote) {
  return remote.captured ? "captured" : remote.status;
}

function comparePayment(local, remote) {
  const findings = [];

  // Local database stores amounts in paise.
  const localAmount = Number(local.amountPaise);

  // Provider transaction amounts are also expected in paise.
  const providerAmount = Number(remote.amount);

  const localCurrency = String(local.currency ?? "").toUpperCase();
  const providerCurrency = String(remote.currency ?? "").toUpperCase();

  const localStatus = getLocalStatus(local);
  const providerStatus = getProviderStatus(remote);

  if (
    !Number.isFinite(localAmount) ||
    !Number.isFinite(providerAmount) ||
    localAmount !== providerAmount
  ) {
    findings.push({
      type: "amount_mismatch",
      details: "Local and provider amounts differ.",
    });
  }

  if (localCurrency !== providerCurrency) {
    findings.push({
      type: "currency_mismatch",
      details: "Local and provider currencies differ.",
    });
  }

  if (localStatus !== providerStatus) {
    findings.push({
      type: "status_mismatch",
      details: "Local and provider payment statuses differ.",
    });
  }

  if (findings.length === 0) {
    return [
      {
        type: "matched",
        details: "Local payment matches the provider record.",
      },
    ];
  }

  return findings;
}

async function getLocalPayments({ provider, start, end }) {
  const filter = {
    provider,
    createdAt: {
      $gte: start,
      $lt: end,
    },
  };

  const payments = await Payment.find(filter)
    .select(
      [
        "_id",
        "provider",
        "providerPaymentId",
        "providerOrderId",
        "providerCheckoutSessionId",
        "amountPaise",
        "currency",
        "status",
        "createdAt",
        "paidAt",
      ].join(" ")
    )
    .sort({ createdAt: 1, _id: 1 })
    .limit(MAX_LOCAL_RECORDS + 1)
    .lean();

  if (payments.length > MAX_LOCAL_RECORDS) {
    throw new Error(
      "Local reconciliation exceeded the record limit. Use a smaller date range."
    );
  }

  return payments;
}

function makeFinding({
  type,
  provider,
  local,
  remote,
  details,
}) {
  return {
    type,
    provider,
    localPaymentId: local?._id ?? null,
    providerReference:
      remote?.reference ?? local?.providerPaymentId ?? null,

    // Local schema uses amountPaise.
    localAmount: local?.amountPaise ?? null,

    // Provider transaction amount is in paise.
    providerAmount: remote?.amount ?? null,

    localCurrency: local?.currency ?? null,
    providerCurrency: remote?.currency ?? null,
    localStatus: local ? getLocalStatus(local) : null,
    providerStatus: remote ? getProviderStatus(remote) : null,
    details: details ?? "",
  };
}

export async function reconcileProviderPayments({
  provider,
  start,
  end,
  startedBy,
}) {
  if (!["razorpay", "stripe"].includes(provider)) {
    throw new Error("Unsupported reconciliation provider");
  }

  if (!mongoose.isValidObjectId(startedBy)) {
    throw new Error("Invalid admin user ID");
  }

  const periodStart = new Date(start);
  const periodEnd = new Date(end);

  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart >= periodEnd
  ) {
    throw new Error("Invalid reconciliation date range");
  }

  const run = await ReconciliationRun.create({
    provider,
    status: "running",
    periodStart,
    periodEnd,
    startedBy,
  });

  try {
    const [localPayments, providerTransactions] = await Promise.all([
      getLocalPayments({
        provider,
        start: periodStart,
        end: periodEnd,
      }),
      provider === "razorpay"
        ? fetchRazorpayTransactions({
            start: periodStart,
            end: periodEnd,
          })
        : fetchStripeTransactions({
            start: periodStart,
            end: periodEnd,
          }),
    ]);

    const localByReference = new Map();
    const providerByReference = new Map();
    const findings = [];

    for (const local of localPayments) {
      const reference = normalizeReference(local.providerPaymentId);

      if (!reference) {
        findings.push(
          makeFinding({
            type: "local_only",
            provider,
            local,
            details: "Local payment has no provider payment reference.",
          })
        );
        continue;
      }

      if (localByReference.has(reference)) {
        findings.push(
          makeFinding({
            type: "duplicate_provider_reference",
            provider,
            local,
            details:
              "Multiple local records share this provider reference.",
          })
        );
        continue;
      }

      localByReference.set(reference, local);
    }

    for (const remote of providerTransactions) {
      const reference = normalizeReference(remote.reference);

      if (!reference) {
        continue;
      }

      if (providerByReference.has(reference)) {
        findings.push(
          makeFinding({
            type: "duplicate_provider_reference",
            provider,
            remote,
            details:
              "Provider returned a duplicate transaction reference.",
          })
        );
        continue;
      }

      providerByReference.set(reference, remote);
    }

    let matchedCount = 0;

    for (const [reference, local] of localByReference) {
      const remote = providerByReference.get(reference);

      if (!remote) {
        findings.push(
          makeFinding({
            type: "local_only",
            provider,
            local,
            details:
              "Local payment was not found in the provider transaction list.",
          })
        );
        continue;
      }

      providerByReference.delete(reference);

      const comparisons = comparePayment(local, remote);

      for (const comparison of comparisons) {
        findings.push(
          makeFinding({
            type: comparison.type,
            provider,
            local,
            remote,
            details: comparison.details,
          })
        );
      }

      if (
        comparisons.length === 1 &&
        comparisons[0].type === "matched"
      ) {
        matchedCount += 1;
      }
    }

    for (const remote of providerByReference.values()) {
      findings.push(
        makeFinding({
          type: "provider_only",
          provider,
          remote,
          details:
            "Provider transaction has no matching local payment record.",
        })
      );
    }

    const discrepancyCount = findings.filter(
      (finding) => finding.type !== "matched"
    ).length;

    run.status = "completed";
    run.completedAt = new Date();

    run.summary = {
      localCount: localPayments.length,
      providerCount: providerTransactions.length,
      matchedCount,
      discrepancyCount,
    };

    run.findings = findings;

    await run.save();

    return run;
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date();
    run.errorCode = "RECONCILIATION_FAILED";

    await run.save();

    throw error;
  }
}
