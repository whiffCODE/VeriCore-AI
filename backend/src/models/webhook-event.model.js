
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const webhookEventSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
    },

    eventId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    payloadHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/i,
    },

    status: {
      type: String,
      enum: ["received", "processing", "processed", "failed"],
      default: "received",
      required: true,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    receivedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    processingStartedAt: {
      type: Date,
    },

    processedAt: {
      type: Date,
    },

    // Supports recovery of abandoned processing attempts in a later phase.
    leaseUntil: {
      type: Date,
    },

    lastError: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

webhookEventSchema.index(
  { provider: 1, eventId: 1 },
  { unique: true, name: "unique_provider_webhook_event" },
);

webhookEventSchema.index({ status: 1, leaseUntil: 1 });

const WebhookEvent =
  models.WebhookEvent ?? model("WebhookEvent", webhookEventSchema);

export default WebhookEvent;
