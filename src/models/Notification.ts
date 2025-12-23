import mongoose, { Document, Schema } from "mongoose";

export interface INotification extends Document {
  user: mongoose.Types.ObjectId; // người nhận thông báo
  sender?: mongoose.Types.ObjectId;
  type: "message" | "system" | "review" | "booking" | "postApproval";
  content: string;
  post?: mongoose.Types.ObjectId; // bài đăng liên quan (nếu có)
  isRead: boolean;
  createdAt?: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["message", "system", "review", "booking", "postApproval"],
      default: "system",
    },
    content: { type: String, required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: false },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, type: 1 });

const Notification = mongoose.model<INotification>("Notification", notificationSchema);
export default Notification;
