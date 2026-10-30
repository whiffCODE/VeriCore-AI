
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const paymentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    planId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    tier: {
      type: String,
      enum: ["pro", "enterprise"],
      required: true,
    },

    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
    },

    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment amount must be an integer in paise.",
      },
    },

    currency: {
      type: String,
      required: true,
      enum: ["INR"],
      default: "INR",
      uppercase: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "authorized",
        "captured",
        "failed",
        "refunded",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    // Internal idempotency key supplied by the authenticated client.
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },

    // Provider-generated identifiers.
    providerOrderId: {
      type: String,
      trim: true,
    },

    providerPaymentId: {
      type: String,
      trim: true,
    },

    providerCheckoutSessionId: {
      type: String,
      trim: true,
    },

    receiptNumber: {
      type: String,
      trim: true,
    },

    failureCode: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    failureMessage: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    paidAt: {
      type: Date,
    },

    refundedAt: {
      type: Date,
    },

    // Store only non-secret operational metadata.
    metadata: {
      type: Map,
      of: String,
      default: undefined,
    },

    // Razorpay order creation concurrency control.
    orderCreationStatus: {
      type: String,
      enum: ["not_started", "creating", "created", "failed"],
      default: "not_started",
      required: true,
    },

    orderCreationLeaseUntil: {
      type: Date,
    },

    // Stripe Checkout Session creation concurrency control.
    checkoutCreationStatus: {
      type: String,
      enum: ["not_started", "creating", "created", "failed"],
      default: "not_started",
      required: true,
    },

    checkoutCreationLeaseUntil: {
      type: Date,
    },

    // Linked subscription created after successful payment verification.
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

// One client request key must not create multiple payments for the same user.
paymentSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    name: "unique_user_payment_idempotency",
  },
);

// Provider order IDs must be unique when present.
paymentSchema.index(
  { provider: 1, providerOrderId: 1 },
  {
    unique: true,
    name: "unique_provider_order",
    partialFilterExpression: {
      providerOrderId: { $type: "string" },
    },
  },
);

// Provider payment IDs must be unique when present.
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    unique: true,
    name: "unique_provider_payment",
    partialFilterExpression: {
      providerPaymentId: { $type: "string" },
    },
  },
);

// Stripe Checkout Session IDs must be unique when present.
paymentSchema.index(
  { provider: 1, providerCheckoutSessionId: 1 },
  {
    unique: true,
    name: "unique_provider_checkout_session",
    partialFilterExpression: {
      providerCheckoutSessionId: { $type: "string" },
    },
  },
);

// User payment history.
paymentSchema.index({ userId: 1, createdAt: -1 });

// Efficient lookup of payments by subscription.
paymentSchema.index(
  { subscriptionId: 1 },
  {
    name: "payments_by_subscription",
    partialFilterExpression: {
      subscriptionId: { $type: "objectId" },
    },
  },
);

const Payment = models.Payment ?? model("Payment", paymentSchema);

export default Payment;
