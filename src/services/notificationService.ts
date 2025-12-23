import Notification from "../models/Notification";
import mongoose from "mongoose";

export class NotificationService {
    // Tạo thông báo mới
    static async createNotification({
        user,
        sender,
        type,
        content,
        post,
    }: {
        user: string;
        sender?: string;
        type: "message" | "system" | "review" | "booking" | "postApproval";
        content: string;
        post?: string;
    }) {
        const notification = await Notification.create({
            user,
            sender,
            type,
            content,
            post,
        });
        return notification;
    }

    // Lấy danh sách thông báo của 1 user
    static async getNotifications(userId: string) {
        return Notification.find({ user: userId })
            .populate("sender", "name avatar")
            .populate("post", "title")
            .sort({ createdAt: -1 });
    }

    // Đánh dấu đã đọc 1 thông báo
    static async markAsRead(notificationId: string) {
        return Notification.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
    }

    // Đánh dấu tất cả đã đọc
    static async markAllAsRead(userId: string) {
        return Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
    }

    // Xóa 1 thông báo
    static async deleteNotification(notificationId: string) {
        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            throw new Error("ID thông báo không hợp lệ");
        }

        const notification = await Notification.findByIdAndDelete(notificationId);
        if (!notification) {
            throw new Error("Không tìm thấy thông báo để xóa");
        }

        return notification;
    }
}

