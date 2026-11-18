import mongoose, {
  type InferSchemaType,
} from "mongoose";

const { Schema } = mongoose;

const organisationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 80,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    settings: {
      defaultTimezone: {
        type: String,
        default: "Asia/Kolkata",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type Organisation =
  InferSchemaType<typeof organisationSchema>;

export const OrganisationModel = mongoose.models.Organisation || mongoose.model("Organisation", organisationSchema);
