import mongoose, { Document, Schema } from "mongoose";

export interface IPostFee extends Document {
  feeAmount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const PostFeeSchema = new Schema<IPostFee>(
  {
    feeAmount: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

const PostFee = mongoose.model<IPostFee>("PostFee", PostFeeSchema);
export default PostFee;
