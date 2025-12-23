import { Request, Response } from "express";
import { NotificationService } from "../services/notificationService";

export class NotificationController {
    // Tạo thông báo mới
    static async create(req: Request, res: Response) {
        try {
            const { user, sender, type, content, post } = req.body;
            const notification = await NotificationService.createNotification({
                user,
                sender,
                type,
                content,
                post,
            });

            // Gửi realtime qua socket (nếu socket có sẵn)
            const io = req.app.get("io");
            if (io) {
                io.to(user).emit("newNotification", notification);
            }

            res.status(201).json(notification);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Lấy tất cả thông báo của user
    static async getAll(req: Request & { user?: any }, res: Response) {
        try {
            // Lấy userId từ token (được gắn sẵn trong authMiddleware)
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ message: "Không xác định được người dùng" });
            }

            const notifications = await NotificationService.getNotifications(userId);
            res.json(notifications);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Đánh dấu 1 thông báo đã đọc realtime
    static async markRead(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const updated = await NotificationService.markAsRead(id);

            const io = req.app.get("io");
            if (io && updated) {
                // Gửi event realtime cho user
                io.to(updated.user.toString()).emit("notificationUpdated", updated);
            }

            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Đánh dấu tất cả thông báo đã đọc realtime
    static async markAllRead(req: Request, res: Response) {
        try {
            const { userId } = req.params;
            await NotificationService.markAllAsRead(userId);

            const io = req.app.get("io");
            if (io) {
                // Gửi event realtime cho user
                io.to(userId).emit("notificationsMarkedAllRead");
            }

            res.json({ message: "All notifications marked as read" });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Xóa một thông báo
    static async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const deleted = await NotificationService.deleteNotification(id);

            // Gửi realtime tới client nếu có
            const io = req.app.get("io");
            if (io && deleted) {
                io.to(deleted.user.toString()).emit("notificationDeleted", deleted._id);
            }

            res.json({ message: "Notification deleted successfully", deleted });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}
