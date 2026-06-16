import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
  name: string;
  description?: string;
  isDeleted: boolean;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Category = mongoose.model<ICategory>("Category", categorySchema);
export default Category;
