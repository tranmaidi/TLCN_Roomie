import Message from "../models/Message";
import Conversation from "../models/Conversation";
import mongoose from "mongoose";
import { NotificationService } from "./notificationService";

export class MessageService {
  // Gửi tin nhắn + tạo thông báo realtime
  static async sendMessage({
    io,
    conversationId,
    senderId,
    text,
    images = [],
    files = [],
  }: {
    io?: any;
    conversationId: string;
    senderId: string;
    text?: string;
    images?: string[];
    files?: string[];
  }) {
    if (!mongoose.Types.ObjectId.isValid(conversationId))
      throw new Error("ID hội thoại không hợp lệ");

    // Lấy conversation để xác định tất cả thành viên
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại");

    const message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      text,
      images,
      files,
    });

    // Cập nhật lastMessage
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
    });

    const populatedMessage = await message.populate([
      { path: "sender", select: "name avatar" },
      { path: "receiver", select: "name avatar" }, // receiver sẽ populate từng message nếu cần
    ]);

    // Tạo notification cho tất cả thành viên còn lại
    if (io) {
      const recipients = conversation.members
        .map((m) => m.toString())
        .filter((id) => id !== senderId); // loại bỏ sender

      for (const userId of recipients) {
        const notification = await NotificationService.createNotification({
          user: userId,
          sender: senderId,
          type: "message",
          content: text || "Bạn có tin nhắn mới",
        });

        io.to(userId).emit("newNotification", notification);
      }
    }

    return populatedMessage;
  }

  // Lấy lịch sử tin nhắn
  static async getMessages(conversationId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) throw new Error("ID hội thoại không hợp lệ");

    return await Message.find({ conversation: conversationId })
      .populate("sender", "name avatar")
      .populate("receiver", "name avatar")
      .sort({ createdAt: 1 }); // tin cũ trước
  }

  // Sửa tin nhắn
  static async editMessage(messageId: string, userId: string, newText: string) {
    const message = await Message.findById(messageId);
    if (!message) throw new Error("Không tìm thấy tin nhắn");
    if (message.sender.toString() !== userId) throw new Error("Bạn không có quyền sửa tin nhắn này");

    message.text = newText;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    return message;
  }

  // Thu hồi (xóa) tin nhắn
  static async recallMessage(messageId: string, userId: string) {
    const message = await Message.findById(messageId);
    if (!message) throw new Error("Không tìm thấy tin nhắn");
    if (message.sender.toString() !== userId) throw new Error("Bạn không có quyền thu hồi tin nhắn này");

    message.isRecalled = true;
    message.recalledAt = new Date();
    message.text = "";
    message.images = [];
    message.files = [];
    await message.save();

    return message;
  }

  static async markAsRead(messageId: string, userId: string) {
    const message = await Message.findById(messageId);
    if (!message) throw new Error("Không tìm thấy tin nhắn");

    // Lấy hội thoại để kiểm tra thành viên
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation) throw new Error("Không tìm thấy hội thoại");

    const isMember = conversation.members.some(
      (m) => m.toString() === userId
    );

    if (!isMember)
      throw new Error("Bạn không phải thành viên của hội thoại này");

    // Chỉ người nhận (khác sender) mới có quyền đánh dấu đã đọc
    if (
      message.sender.toString() !== userId &&
      message.status !== "READ"
    ) {
      message.status = "READ";
      await message.save();
      console.log(`Message ${messageId} marked as READ by ${userId}`);
    } else {
      console.log(`messageSeen ignored (sender or already read)`);
    }

    return await message.populate([
      { path: "sender", select: "name avatar" },
      { path: "receiver", select: "name avatar" },
    ]);
  }
}
