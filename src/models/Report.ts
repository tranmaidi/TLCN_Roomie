import mongoose, { Document, Schema } from "mongoose";

export type ReportReason = "Spam" | "Lừa đảo" | "Nội dung không phù hợp" | "Tin giả" | "Khác";
export type ReportStatus = "Chưa xử lý" | "Đã xử lý";

export interface IReport extends Document {
  post: mongoose.Types.ObjectId;
  reporter: mongoose.Types.ObjectId;
  reason: ReportReason;
  status: ReportStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const reportSchema = new Schema<IReport>(
  {
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["Spam", "Lừa đảo", "Nội dung không phù hợp", "Tin giả", "Khác"],
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Chưa xử lý", "Đã xử lý"],
      default: "Chưa xử lý",
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// 1 user không thể report cùng 1 post nhiều lần
reportSchema.index({ post: 1, reporter: 1 }, { unique: true });
reportSchema.index({ post: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });

const Report = mongoose.model<IReport>("Report", reportSchema);
export default Report;
