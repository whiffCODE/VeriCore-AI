
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
    },

    endsAt: {
      type: Date,
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

    // Used only when a real recurring subscription exists with the provider.
    providerSubscriptionId: {
      type: String,
      trim: true,
    },

    renewalOf: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },

    cancelledAt: {
      type: Date,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    lastRenewalAttemptAt: {
      type: Date,
    },

    nextRenewalAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

subscriptionSchema.index({ userId: 1, status: 1, endsAt: 1 });

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

subscriptionSchema.index(
  { paymentId: 1 },
  { unique: true, name: "one_subscription_per_payment" },
);


subscriptionSchema.pre("validate", function validateSubscriptionDates() {
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate(
      "endsAt",
      "Subscription end must be after its start.",
    );
  }

  if (this.status === "active" && (!this.startsAt || !this.endsAt)) {
    this.invalidate(
      "startsAt",
      "An active subscription must have start and end dates.",
    );
  }
});


const Subscription =
  models.Subscription ?? model("Subscription", subscriptionSchema);

export default Subscription;
