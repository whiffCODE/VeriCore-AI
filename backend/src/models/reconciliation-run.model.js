import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const findingSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "matched",
        "provider_only",
        "local_only",
        "amount_mismatch",
        "currency_mismatch",
        "status_mismatch",
        "duplicate_provider_reference",
      ],
      required: true,
    },

    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
    },

    localPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    providerReference: {
      type: String,
      default: null,
    },

    localAmount: {
      type: Number,
      default: null,
    },

    providerAmount: {
      type: Number,
      default: null,
    },

    localCurrency: {
      type: String,
      default: null,
    },

    providerCurrency: {
      type: String,
      default: null,
    },

    localStatus: {
      type: String,
      default: null,
    },

    providerStatus: {
      type: String,
      default: null,
    },

    details: {
      type: String,
      maxlength: 1000,
      default: "",
    },
  },
  { _id: false }
);

const reconciliationRunSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["razorpay", "stripe", "all"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
      default: "running",
      index: true,
    },

    periodStart: {
      type: Date,
      required: true,
    },

    periodEnd: {
      type: Date,
      required: true,
    },

    startedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    summary: {
      localCount: { type: Number, default: 0 },
      providerCount: { type: Number, default: 0 },
      matchedCount: { type: Number, default: 0 },
      discrepancyCount: { type: Number, default: 0 },
    },

    findings: {
      type: [findingSchema],
      default: [],
    },

    errorCode: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

reconciliationRunSchema.index({ createdAt: -1 });

export const ReconciliationRun =
  models.ReconciliationRun ||
  model("ReconciliationRun", reconciliationRunSchema);
