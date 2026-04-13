import mongoose, { Document, Schema } from "mongoose";

export interface IPackage extends Document {
  name: string;
  price: number;
  days: number;
  priority_level: number; // 1 = Premium, 2 = Basic, 0 = normal
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const PackageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    days: { type: Number, required: true },
    priority_level: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Package = mongoose.model<IPackage>("Package", PackageSchema);
export default Package;
