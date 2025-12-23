import { Router } from "express";
import { ConversationController } from "../controllers/conversationController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Tạo hội thoại mới
router.post("/", authMiddleware, ConversationController.create);

// Lấy danh sách hội thoại của người dùng
router.get("/", authMiddleware, ConversationController.getUserConversations);

// Xóa hội thoại
router.delete("/:id", authMiddleware, ConversationController.delete);

export default router;
