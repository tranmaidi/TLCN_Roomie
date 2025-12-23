import express from "express";
import { NotificationController } from "../controllers/notificationController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

// Tạo thông báo mới (có realtime)
router.post("/", NotificationController.create);

// Lấy tất cả thông báo
router.get("/all", authMiddleware, NotificationController.getAll);

// Đánh dấu 1 thông báo đã đọc (có realtime)
router.put("/read/:id", NotificationController.markRead);

// Đánh dấu tất cả đã đọc (có realtime)
router.put("/read-all/:userId", NotificationController.markAllRead);

// Xóa một thông báo (có realtime)
router.delete("/:id", NotificationController.delete);

export default router;
