
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const subscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
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

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "expired",
        "cancelled",
        "past_due",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    startsAt: {
      type: Date,
      required: function () {
        return ["pending", "active"].includes(this.status);
      },
    },

    endsAt: {
      type: Date,
      required: function () {
        return ["pending", "active"].includes(this.status);
      },
    },

    autoRenew: {
      type: Boolean,
      default: false,
      required: true,
    },

    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
    },

    // Set only when a real recurring subscription exists with the provider.
    providerSubscriptionId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    renewalOf: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    lastRenewalAttemptAt: {
      type: Date,
      default: null,
    },

    nextRenewalAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

// Efficient user subscription history and lifecycle queries.
subscriptionSchema.index(
  { userId: 1, status: 1, endsAt: 1 },
  { name: "user_subscription_lifecycle" },
);

// Efficient expiry-worker queries.
subscriptionSchema.index(
  { status: 1, endsAt: 1 },
  { name: "subscription_expiry_lookup" },
);

// Prevent duplicate provider subscription references.
subscriptionSchema.index(
  { provider: 1, providerSubscriptionId: 1 },
  {
    unique: true,
    name: "unique_provider_subscription",
    partialFilterExpression: {
      providerSubscriptionId: { $type: "string" },
    },
  },
);

// A payment can activate only one subscription.
subscriptionSchema.index(
  { paymentId: 1 },
  {
    unique: true,
    name: "one_subscription_per_payment",
  },
);

subscriptionSchema.pre("validate", function validateSubscription() {
  const requiresDates = ["pending", "active"].includes(this.status);

  if (requiresDates && (!this.startsAt || !this.endsAt)) {
    this.invalidate(
      "startsAt",
      "Pending and active subscriptions must have start and end dates.",
    );
  }

  if (this.startsAt && !this.endsAt) {
    this.invalidate(
      "endsAt",
      "An end date is required when a start date is provided.",
    );
  }

  if (this.endsAt && !this.startsAt) {
    this.invalidate(
      "startsAt",
      "A start date is required when an end date is provided.",
    );
  }

  if (
    this.startsAt &&
    this.endsAt &&
    this.endsAt <= this.startsAt
  ) {
    this.invalidate(
      "endsAt",
      "Subscription end must be after its start.",
    );
  }

  if (this.status === "cancelled" && !this.cancelledAt) {
    this.invalidate(
      "cancelledAt",
      "A cancelled subscription must have a cancellation date.",
    );
  }

  if (this.status !== "cancelled" && this.cancelledAt) {
    this.invalidate(
      "cancelledAt",
      "Cancellation date is only allowed for cancelled subscriptions.",
    );
  }

  if (this.autoRenew && !this.providerSubscriptionId) {
    this.invalidate(
      "providerSubscriptionId",
      "Auto-renew requires a provider subscription reference.",
    );
  }
});

const Subscription =
  models.Subscription ?? model("Subscription", subscriptionSchema);

export default Subscription;
