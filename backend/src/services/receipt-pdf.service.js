import PDFDocument from "pdfkit";

function formatMoney(amountMinor, currency) {
  const amount = Number(amountMinor) / 100;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: String(currency).toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(date)) + " UTC";
}

function safeText(value, fallback = "Not provided") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

export function createReceiptPdf(receipt) {
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: 48,
      bottom: 48,
      left: 52,
      right: 52,
    },
    info: {
      Title: `VeriCore AI Receipt ${receipt.receiptNumber}`,
      Author: "VeriCore AI",
      Subject: "Subscription payment receipt",
      Creator: "VeriCore AI Billing",
    },
  });

  const left = 52;
  const right = 543;
  const contentWidth = right - left;

  // Brand header
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#172554")
    .text("VeriCore AI", left, 48);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text("Enterprise Knowledge & SOP Platform", left, 76);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#0f172a")
    .text("PAYMENT RECEIPT", left, 122);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#475569")
    .text("Receipt number", left, 158);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#0f172a")
    .text(safeText(receipt.receiptNumber), left, 174);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#475569")
    .text("Payment date", 330, 158);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#0f172a")
    .text(formatDate(receipt.paymentDate), 330, 174, {
      width: 210,
    });

  // Customer details
  doc
    .moveTo(left, 214)
    .lineTo(right, 214)
    .strokeColor("#e2e8f0")
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#0f172a")
    .text("BILLED TO", left, 232);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#334155")
    .text(safeText(receipt.customer?.name), left, 252);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#334155")
    .text(safeText(receipt.customer?.email), left, 268);

  // Payment details table
  const tableTop = 320;
  const descriptionX = left;
  const amountX = 420;

  doc
    .rect(left, tableTop, contentWidth, 30)
    .fill("#f1f5f9");

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#334155")
    .text("DESCRIPTION", descriptionX + 10, tableTop + 10);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#334155")
    .text("AMOUNT", amountX, tableTop + 10, {
      width: 110,
      align: "right",
    });

  const description =
    safeText(receipt.planName) +
    "\n" +
    safeText(receipt.description, "Subscription payment");

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#0f172a")
    .text(description, descriptionX + 10, tableTop + 46, {
      width: 330,
      lineGap: 4,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#0f172a")
    .text(
      formatMoney(receipt.amount, receipt.currency),
      amountX,
      tableTop + 46,
      {
        width: 110,
        align: "right",
      }
    );

  doc
    .moveTo(left, tableTop + 105)
    .lineTo(right, tableTop + 105)
    .strokeColor("#e2e8f0")
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#0f172a")
    .text("TOTAL PAID", left + 10, tableTop + 122);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#0f172a")
    .text(
      formatMoney(receipt.amount, receipt.currency),
      amountX,
      tableTop + 122,
      {
        width: 110,
        align: "right",
      }
    );

  // Transaction information
  const transactionTop = tableTop + 180;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#0f172a")
    .text("TRANSACTION DETAILS", left, transactionTop);

  const transactionRows = [
    ["Payment provider", safeText(receipt.provider).toUpperCase()],
    ["Provider payment ID", safeText(receipt.providerPaymentId)],
    ["Plan ID", safeText(receipt.planId)],
    ["Currency", safeText(receipt.currency).toUpperCase()],
    ["Payment status", "PAID"],
  ];

  let rowY = transactionTop + 24;

  for (const [label, value] of transactionRows) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text(label, left, rowY, {
        width: 150,
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#334155")
      .text(value, left + 155, rowY, {
        width: contentWidth - 155,
      });

    rowY += 20;
  }

  // Footer
  doc
    .moveTo(left, 735)
    .lineTo(right, 735)
    .strokeColor("#e2e8f0")
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      "This receipt confirms that the payment listed above was recorded as paid.",
      left,
      750,
      {
        width: contentWidth,
        align: "center",
      }
    );

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      "Thank you for choosing VeriCore AI.",
      left,
      766,
      {
        width: contentWidth,
        align: "center",
      }
    );

  doc.end();

  return doc;
}
