import { Request, Response } from "express";
import * as chatbotService from "../services/chatbotService";

type ChatbotBody = {
  message?: string;
  roomId?: string;
  compareRoomIds?: string[];
};

function isStringArray(v: any): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export const chat = async (req: Request<{}, {}, ChatbotBody>, res: Response) => {
  try {
    const { message, roomId, compareRoomIds } = req.body;

    // Validate request body
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Trường 'message' là bắt buộc" });
    }

    if (roomId !== undefined && typeof roomId !== "string") {
      return res.status(400).json({ message: "Trường 'roomId' phải là string" });
    }

    if (compareRoomIds !== undefined && !isStringArray(compareRoomIds)) {
      return res.status(400).json({ message: "Trường 'compareRoomIds' phải là mảng string" });
    }

  const result = await chatbotService.chatWithGemini({
      message,
      roomId,
      compareRoomIds,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    // Gemini/config errors are treated as 500
    return res.status(500).json({ message: err.message || "Lỗi server" });
  }
};
