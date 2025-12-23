import mongoose from "mongoose";
import Conversation from "../models/Conversation";
import User from "../models/User";
import Message from "../models/Message";

export class ConversationService {
  // Tạo hội thoại
  static async createConversation(userId: string, receiverId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      throw new Error("ID không hợp lệ");
    }

    // Kiểm tra nếu hội thoại đã tồn tại
    let existing = await Conversation.findOne({
      members: { $all: [userId, receiverId] },
    }).populate("members", "name avatar");

    if (existing) {
      // Nếu trước đó user đã ẩn (deletedFor includes userId), bỏ ẩn cho user đó
      const deletedFor = (existing.deletedFor || []).map((d) => d.toString());
      if (deletedFor.includes(userId)) {
        existing.deletedFor = (existing.deletedFor || []).filter((d) => d.toString() !== userId);
        await existing.save();
        // reload with populate
        existing = await Conversation.findById(existing._id).populate("members", "name avatar");
        if (!existing) throw new Error("Không tìm thấy cuộc hội thoại sau khi reload");
      }

      // chuẩn hoá thông tin avatar/name theo userId (trả về conversation với avatar/name của người còn lại)
      const convObj: any = existing.toObject();
      const other = (existing.members as any[]).find((m) => m._id.toString() !== userId);
      if (other) {
        convObj.avatar = other.avatar || "";
        convObj.name = other.name || "";
        convObj.otherId = other._id;
      }
      return convObj;
    }

    // Lấy avatar của người được nhắn (dùng làm default)
    const receiver = await User.findById(receiverId);
    if (!receiver) throw new Error("Không tìm thấy người nhận");

    const conversation = await Conversation.create({
      members: [userId, receiverId],
      avatar: receiver.avatar || "",
      name: receiver.name || "",
    });

    const populated = await conversation.populate("members", "name avatar");

    // chuyển thành plain object và gán avatar/name tương ứng với "other" (receiver)
    const convObj: any = populated.toObject();
    const other = (populated.members as any[]).find((m) => m._id.toString() !== userId);
    if (other) {
      convObj.avatar = other.avatar || "";
      convObj.name = other.name || "";
      convObj.otherId = other._id;
    }

    return convObj;
  }

  // Lấy danh sách hội thoại của người dùng
  static async getUserConversations(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("ID không hợp lệ");
    }

    const conversations = await Conversation.find({
      members: { $in: [userId] },
      deletedFor: { $ne: new mongoose.Types.ObjectId(userId) },
    })
      .populate("members", "name avatar")
      .populate({
        path: "lastMessage",
        select: "text sender createdAt",
        populate: { path: "sender", select: "name avatar" },
      })
      .sort({ updatedAt: -1 });

    // Map để gán avatar/name = của "người còn lại"
    const result = conversations.map((conv) => {
      const convObj: any = conv.toObject();
      const members = convObj.members || [];
      const other = members.find((m: any) => m._id.toString() !== userId);
      if (other) {
        convObj.avatar = other.avatar || "";
        convObj.name = other.name || "";
        convObj.otherId = other._id;
      } else {
        // fallback: nếu không có other (ví dụ conversation chỉ có 1 member)
        convObj.avatar = convObj.avatar || "";
        convObj.name = convObj.name || "";
      }
      return convObj;
    });

    return result;
  }

  // Ẩn/Xóa hội thoại cho user (soft-delete per user). Nếu tất cả member đều ẩn => xóa thật.
  static async deleteConversation(conversationId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error("ID không hợp lệ");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("User ID không hợp lệ");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Không tìm thấy cuộc hội thoại");

    const isMember = conversation.members.some((m) => m.toString() === userId);
    if (!isMember) throw new Error("Bạn không có quyền xóa cuộc hội thoại này");

    const alreadyDeleted = (conversation.deletedFor || []).some((d) => d.toString() === userId);
    if (alreadyDeleted) {
      return { message: "Cuộc hội thoại đã được ẩn với bạn" };
    }

    // Thêm user vào deletedFor
    conversation.deletedFor = [...(conversation.deletedFor || []), new mongoose.Types.ObjectId(userId)];
    await conversation.save();

    // Nếu tất cả member đều đã ẩn => xóa conversation khỏi DB và dọn message liên quan
    const membersCount = conversation.members.length;
    const deletedCount = (conversation.deletedFor || []).length;
    if (deletedCount >= membersCount) {
      // Xóa message liên quan trước, sau đó xóa conversation
      await Message.deleteMany({ conversation: conversation._id });
      await Conversation.findByIdAndDelete(conversationId);
      return { message: "Cuộc hội thoại đã được xóa hoàn toàn" };
    }

    return { message: "Đã ẩn cuộc hội thoại với bạn" };
  }
}
