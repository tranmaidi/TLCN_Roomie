import { Request, Response } from "express";
import { MessageService } from "../services/messageService";

export class MessageController {
  // GET /api/messages/:conversationId
  static async getMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const messages = await MessageService.getMessages(conversationId);
      res.json(messages);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

}
