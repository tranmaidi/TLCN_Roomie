import mongoose, { Document, Schema } from "mongoose";

export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";

export interface ISubscription extends Document {
  user: mongoose.Types.ObjectId;
  package: mongoose.Types.ObjectId;
  status: SubscriptionStatus;
  startAt?: Date;
  expiryAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    package: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    status: { type: String, enum: ["pending", "active", "expired", "cancelled"], default: "pending" },
    startAt: { type: Date },
    expiryAt: { type: Date },
  },
  { timestamps: true }
);

const Subscription = mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
export default Subscription;
