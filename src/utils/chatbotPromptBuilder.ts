import { IPost } from "../models/Post";

function safeString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatMoneyVND(price?: number): string {
  if (typeof price !== "number" || !isFinite(price)) return "(không rõ)";
  try {
    return `${price.toLocaleString("vi-VN")} đ`;
  } catch {
    return `${price} đ`;
  }
}

export function buildChatbotSystemInstruction(): string {
  return [
    "Bạn là chatbot hỗ trợ tìm phòng trọ.",
    "Luôn trả lời bằng tiếng Việt, thân thiện, ngắn gọn.",
    "TUYỆT ĐỐI KHÔNG bịa thông tin.",
    "Bạn chỉ được sử dụng dữ liệu về phòng được cung cấp trong CONTEXT.",
    "Nếu không đủ dữ liệu để trả lời chính xác, hãy nói rõ: 'Mình chưa đủ thông tin để kết luận...'.",
    "Không suy đoán về các tiện ích/điều kiện không được nêu.",
    "Khi bạn liệt kê phòng (gợi ý/so sánh), LUÔN kèm id bài post theo dạng: (id: <...>) để người dùng có thể bấm xem chi tiết.",
  ].join("\n");
}

export function buildRoomsContext(opts: { currentRoom?: IPost | null; compareRooms?: IPost[]; suggestedRooms?: IPost[] }): string {
  const blocks: string[] = [];

  if (opts.currentRoom) {
    const r = opts.currentRoom;
    blocks.push(
      [
        "CURRENT_ROOM:",
        `id: ${r._id}`,
        `title: ${safeString(r.title)}`,
        `price: ${formatMoneyVND(r.price)}`,
        `city: ${safeString(r.city)}`,
        `district: ${safeString(r.district)}`,
        `ward: ${safeString((r as any).ward)}`,
        `address: ${safeString(r.address)}`,
        `superficies: ${safeString((r as any).superficies)}`,
        `available: ${safeString((r as any).available)}`,
        `description: ${safeString(r.description)}`,
      ].join("\n")
    );
  }

  if (opts.compareRooms && opts.compareRooms.length) {
    const list = opts.compareRooms.map((r, idx) => {
      return [
        `ROOM_${idx + 1}:`,
        `id: ${r._id}`,
        `title: ${safeString(r.title)}`,
        `price: ${formatMoneyVND(r.price)}`,
        `city: ${safeString(r.city)}`,
        `district: ${safeString(r.district)}`,
        `address: ${safeString(r.address)}`,
        `superficies: ${safeString((r as any).superficies)}`,
        `available: ${safeString((r as any).available)}`,
        `description: ${safeString(r.description)}`,
      ].join("\n");
    });

    blocks.push(["COMPARE_ROOMS:", ...list].join("\n\n"));
  }

  if (opts.suggestedRooms && opts.suggestedRooms.length) {
    const list = opts.suggestedRooms.map((r, idx) => {
      const desc = safeString(r.description).replace(/\s+/g, " ").slice(0, 240);
      return `${idx + 1}. id:${r._id} | title:${safeString(r.title)} | price:${formatMoneyVND(r.price)} | city:${safeString(r.city)} | district:${safeString(r.district)} | address:${safeString(r.address)} | desc:${desc}`;
    });
    blocks.push(["SUGGESTED_ROOMS:", ...list].join("\n"));
  }

  if (!blocks.length) {
    return "CONTEXT: (không có dữ liệu phòng được cung cấp)";
  }

  return blocks.join("\n\n");
}

export function buildUserPrompt(message: string): string {
  return [
    "USER_MESSAGE:",
    safeString(message),
    "",
    "Yêu cầu:",
    "- Trả lời ngắn gọn.",
    "- Nếu câu hỏi yêu cầu thông tin không có trong CONTEXT, hãy nói rõ thiếu thông tin.",
    "- Nếu có liệt kê phòng, hãy ghi rõ mỗi phòng: tiêu đề + giá + địa chỉ + (id: ...).",
  ].join("\n");
}
