import mongoose, { Document, Schema } from "mongoose";

export interface IPackage extends Document {
  name: string;
  price: number;
  days: number;
  durationDays?: number;
  description: string;
  priority_level: number; // 1 = Premium, 2 = Basic, 0 = normal
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const PackageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    days: { type: Number, required: true },
    description: { type: String, default: "" },
    priority_level: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Cho phép API mới dùng durationDays nhưng vẫn giữ days để tương thích ngược
PackageSchema.virtual("durationDays")
  .get(function (this: IPackage) {
    return this.days;
  })
  .set(function (this: IPackage, value: number) {
    this.days = value;
  });

const Package = mongoose.model<IPackage>("Package", PackageSchema);
export default Package;
