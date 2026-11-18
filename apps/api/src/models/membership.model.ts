
import mongoose, {
  type InferSchemaType,
} from "mongoose";

const { Schema } = mongoose;

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    organisationId: {
      type: Schema.Types.ObjectId,
      ref: "Organisation",
      required: true,
    },

    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      default: "member",
      required: true,
    },

    status: {
      type: String,
      enum: ["invited", "active", "suspended"],
      default: "active",
      required: true,
    },

    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

membershipSchema.index(
  { userId: 1, organisationId: 1 },
  { unique: true },
);

membershipSchema.index({
  organisationId: 1,
  role: 1,
  status: 1,
});

membershipSchema.index({
  userId: 1,
  status: 1,
});

export type Membership =
  InferSchemaType<typeof membershipSchema>;

export const MembershipModel =
  mongoose.models.Membership ||
  mongoose.model("Membership", membershipSchema);
