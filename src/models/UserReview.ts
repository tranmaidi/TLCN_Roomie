import mongoose, { Document, Schema } from "mongoose";

export interface IUserReview extends Document {
  reviewer: mongoose.Types.ObjectId; // người đánh giá
  reviewee: mongoose.Types.ObjectId; // người được đánh giá
  conversation: mongoose.Types.ObjectId; // hội thoại làm điều kiện
  rating: number; // 1..5
  text?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const userReviewSchema = new Schema<IUserReview>(
  {
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reviewee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: "", maxlength: 500, trim: true },
  },
  { timestamps: true }
);

// 1 người chỉ đánh giá 1 user 1 lần (có thể sửa bằng update)
userReviewSchema.index({ reviewer: 1, reviewee: 1 }, { unique: true });

const UserReview = mongoose.model<IUserReview>("UserReview", userReviewSchema);
export default UserReview;
