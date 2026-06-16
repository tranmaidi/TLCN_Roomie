import Notification from "../models/Notification";
import mongoose from "mongoose";
import User from "../models/User";

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

    // Tạo notification + emit realtime (re-use pattern ở postService)
    static async createAndEmit(
        params: {
            user: string;
            sender?: string;
            type: "message" | "system" | "review" | "booking" | "postApproval";
            content: string;
            post?: string;
        },
        io?: any,
        eventName: string = "newNotification"
    ) {
        const notification = await NotificationService.createNotification(params);
        if (io) {
            io.to(params.user).emit(eventName, notification);
        }
        return notification;
    }

    // Tạo thông báo hệ thống cho tất cả user đang hoạt động
    static async notifyAllUsers(content: string, sender?: string) {
        const users = await User.find({ isDeleted: false }).select("_id").lean();
        if (!users.length) return { insertedCount: 0 };

        const chunks: Array<Array<{ user: mongoose.Types.ObjectId; sender?: mongoose.Types.ObjectId; type: "system"; content: string }>> = [];
        const chunkSize = 500;

        for (let i = 0; i < users.length; i += chunkSize) {
            const slice = users.slice(i, i + chunkSize).map((u: any) => ({
                user: u._id,
                sender: sender && mongoose.Types.ObjectId.isValid(sender) ? new mongoose.Types.ObjectId(sender) : undefined,
                type: "system" as const,
                content,
            }));
            chunks.push(slice);
        }

        let insertedCount = 0;
        for (const chunk of chunks) {
            const docs = await Notification.insertMany(chunk, { ordered: false });
            insertedCount += docs.length;
        }

        return { insertedCount };
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

