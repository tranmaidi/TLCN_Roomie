import { Router } from "express";
import { MessageController } from "../controllers/messageController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Lấy lịch sử tin nhắn
router.get("/:conversationId", authMiddleware, MessageController.getMessages);

export default router;
