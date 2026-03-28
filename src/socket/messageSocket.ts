import { Server, Socket } from "socket.io";
import { MessageService } from "../services/messageService";

export default function initMessageSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

    // Tham gia phòng hội thoại
    socket.on("joinConversation", (conversationId: string) => {
      socket.join(conversationId);
    });

    // Gửi tin nhắn
    socket.on("sendMessage", async (data) => {
      try {
        const { conversationId, senderId, text, images, files } = data;
        const message = await MessageService.sendMessage({
          io,
          conversationId,
          senderId,
          text,
          images,
          files,
        });

        io.to(conversationId).emit("newMessage", message);
      } catch (error: any) {
        console.error("sendMessage error:", error.message);
      }
    });

    // Sửa tin nhắn
    socket.on("editMessage", async (data) => {
      try {
        const { messageId, userId, text, conversationId } = data;
        const message = await MessageService.editMessage(messageId, userId, text);
        io.to(conversationId).emit("messageEdited", message);
      } catch (error: any) {
        console.error("editMessage error:", error.message);
      }
    });

    // Thu hồi tin nhắn
    socket.on("recallMessage", async (data) => {
      try {
        const { messageId, userId, conversationId } = data;
        const message = await MessageService.recallMessage(messageId, userId);
        io.to(conversationId).emit("messageRecalled", message);
      } catch (error: any) {
        console.error("recallMessage error:", error.message);
      }
    });

    // Đánh dấu tin nhắn đã xem
    socket.on("messageSeen", async (data) => {
      try {
        const { messageId, userId, conversationId } = data;
        const message = await MessageService.markAsRead(messageId, userId);
        io.to(conversationId).emit("messageRead", message);
      } catch (error: any) {
        console.error("messageSeen error:", error.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
