import mongoose, { Document, Schema } from "mongoose";

export type TransactionStatus = "pending" | "paid" | "failed";

export interface ITransaction extends Document {
  user: mongoose.Types.ObjectId;
  package: mongoose.Types.ObjectId;
  amount: number;
  status: TransactionStatus;
  providerMeta?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    package: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    providerMeta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
export default Transaction;
