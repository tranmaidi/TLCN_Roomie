import { Server, Socket } from "socket.io";
import { NotificationService } from "../services/notificationService";

export const notificationSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("⚡ User connected:", socket.id);

    // Người dùng join vào phòng riêng theo userId
    socket.on("join", (userId: string) => {
      if (!userId) return;
      socket.join(userId);
      console.log(`✅ User ${userId} joined room ${userId}`);
    });

    // Gửi thông báo mới realtime
    socket.on("sendNotification", async (data) => {
      try {
        const notification = await NotificationService.createNotification(data);
        io.to(data.user).emit("newNotification", notification);
      } catch (error: any) {
        console.error("❌ sendNotification error:", error.message);
      }
    });

    // Đánh dấu 1 thông báo đã đọc realtime
    socket.on("markRead", async (notificationId: string) => {
      try {
        const updated = await NotificationService.markAsRead(notificationId);
        if (updated) {
          io.to(updated.user.toString()).emit("notificationUpdated", updated);
        }
      } catch (error: any) {
        console.error("❌ markRead error:", error.message);
      }
    });

    // Đánh dấu tất cả thông báo đã đọc realtime
    socket.on("markAllRead", async (userId: string) => {
      try {
        await NotificationService.markAllAsRead(userId);
        io.to(userId).emit("notificationsMarkedAllRead");
      } catch (error: any) {
        console.error("❌ markAllRead error:", error.message);
      }
    });

    // Xóa thông báo realtime
    socket.on("deleteNotification", async (notificationId: string) => {
      try {
        const deleted = await NotificationService.deleteNotification(notificationId);
        if (deleted) {
          io.to(deleted.user.toString()).emit("notificationDeleted", deleted._id);
        }
      } catch (error: any) {
        console.error("❌ deleteNotification error:", error.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 User disconnected:", socket.id);
    });
  });
};
