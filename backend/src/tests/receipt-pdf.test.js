import { describe, expect, it } from "vitest";

import { createReceiptPdf } from "../services/receipt-pdf.service.js";

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

describe("receipt PDF generation", () => {
  it("generates a valid PDF document", async () => {
    const receipt = {
      receiptNumber: "VC-2026-TEST123456",
      paymentId: "671234567890123456789012",
      provider: "razorpay",
      providerPaymentId: "pay_test123",
      planId: "pro_monthly",
      planName: "PRO Monthly",
      amount: 49999,
      currency: "INR",
      customer: {
        name: "Test User",
        email: "test@example.com",
      },
      paymentDate: new Date("2026-10-31T08:00:00.000Z"),
      description: "PRO Monthly subscription payment",
    };

    const pdf = createReceiptPdf(receipt);
    const buffer = await collectPdf(pdf);

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1")).toContain("VeriCore AI");
    expect(buffer.toString("latin1")).toContain(
      "VC-2026-TEST123456"
    );
  });
});
