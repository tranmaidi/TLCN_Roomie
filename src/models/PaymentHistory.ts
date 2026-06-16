import mongoose, { Document, Schema } from "mongoose";

export type PaymentHistoryType = "post_activation" | "priority_package";
export type PaymentHistoryStatus = "pending" | "success" | "failed" | "cancelled";

export interface IPaymentHistory extends Document {
  userId: mongoose.Types.ObjectId;
  type: PaymentHistoryType;
  amount: number;
  paymentMethod: string;
  transactionId: string;
  status: PaymentHistoryStatus;
  packageId?: mongoose.Types.ObjectId;
  providerMeta?: any;
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentHistorySchema = new Schema<IPaymentHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["post_activation", "priority_package"], required: true, index: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, required: true, default: "zalopay" },
    transactionId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "success", "failed", "cancelled"], default: "pending", index: true },
    packageId: { type: Schema.Types.ObjectId, ref: "Package" },
    providerMeta: { type: Schema.Types.Mixed },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

PaymentHistorySchema.index({ userId: 1, type: 1, createdAt: -1 });

const PaymentHistory = mongoose.model<IPaymentHistory>("PaymentHistory", PaymentHistorySchema);
export default PaymentHistory;
