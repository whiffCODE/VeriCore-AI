import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const receiptSchema = new Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      immutable: true,
      maxlength: 40,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      unique: true,
      immutable: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
      immutable: true,
    },

    providerPaymentId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 150,
    },

    planId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 100,
    },

    planName: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 150,
    },

    // INR is stored in paise, matching Payment.amountPaise.
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Receipt amount must be an integer in paise.",
      },
    },

    currency: {
      type: String,
      required: true,
      enum: ["INR"],
      default: "INR",
      uppercase: true,
      immutable: true,
    },

    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        immutable: true,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        maxlength: 254,
        immutable: true,
        match: [
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          "Please provide a valid customer email address.",
        ],
      },
    },

    paymentDate: {
      type: Date,
      required: true,
      immutable: true,
      validate: {
        validator: (value) =>
          value instanceof Date && !Number.isNaN(value.getTime()),
        message: "Payment date must be a valid date.",
      },
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      immutable: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  }
);

// Unique indexes prevent duplicate receipts for the same payment.
receiptSchema.index(
  { receiptNumber: 1 },
  { unique: true, name: "receipt_number_unique" }
);

receiptSchema.index(
  { paymentId: 1 },
  { unique: true, name: "receipt_payment_unique" }
);

// Supports a user's receipt history ordered by creation date.
receiptSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "receipts_by_user_date" }
);

const Receipt = models.Receipt || model("Receipt", receiptSchema);

export { Receipt };
export default Receipt;
