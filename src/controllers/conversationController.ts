import { Request, Response } from "express";
import { ConversationService } from "../services/conversationService";

export class ConversationController {
  // POST /api/conversations
  static async create(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const userId = req.user?.id;
      const { receiverId } = req.body;

      if (!userId || !receiverId) {
        return res.status(400).json({ message: "Thiếu thông tin người gửi hoặc người nhận" });
      }

      const conversation = await ConversationService.createConversation(userId, receiverId);
      res.status(201).json(conversation);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  // GET /api/conversations
  static async getUserConversations(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Chưa xác thực người dùng" });

      const conversations = await ConversationService.getUserConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  // DELETE /api/conversations/:id
  static async delete(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) return res.status(401).json({ message: "Chưa xác thực người dùng" });

      const result = await ConversationService.deleteConversation(id, userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
}
