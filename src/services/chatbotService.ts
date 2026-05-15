import mongoose from "mongoose";
import Post, { IPost } from "../models/Post";
import { geminiGenerateText } from "./geminiService";
import { buildChatbotSystemInstruction, buildRoomsContext, buildUserPrompt } from "../utils/chatbotPromptBuilder";

export type ChatbotRequest = {
  message: string;
  roomId?: string;
  compareRoomIds?: string[];
};

export type ChatbotPostCard = {
  _id: string;
  title: string;
  price: number;
  city: string;
  district: string;
  ward?: string;
  address: string;
  images: string[];
  available: boolean;
};

function assertNonEmptyString(val: any, fieldName: string) {
  if (typeof val !== "string" || !val.trim()) {
    throw new Error(`Thiếu hoặc không hợp lệ trường '${fieldName}'`);
  }
}

async function getPostByIdLean(id: string): Promise<IPost | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  return Post.findById(id).lean();
}

async function getPostsByIdsLean(ids: string[], limit = 5): Promise<IPost[]> {
  const valid = (ids || []).filter((id) => mongoose.isValidObjectId(id));
  if (!valid.length) return [];
  const unique = Array.from(new Set(valid)).slice(0, limit);
  return Post.find({ _id: { $in: unique } }).lean();
}

// Simple heuristic search for suggestions based on keyword tokens on fields.
// (Giữ an toàn: chỉ query dựa trên text, không để AI tự bịa điều kiện.)
async function searchSuggestedPosts(message: string, limit = 6): Promise<IPost[]> {
  const tokens = message
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);

  if (!tokens.length) return [];

  const regexes = tokens.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  return Post.find({
    statusApproval: true,
    available: true,
    $or: [{ title: { $in: regexes } }, { description: { $in: regexes } }, { address: { $in: regexes } }, { city: { $in: regexes } }, { district: { $in: regexes } }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function chatWithGemini(input: ChatbotRequest): Promise<{ reply: string }> {
  assertNonEmptyString(input.message, "message");

  const message = input.message.trim();

  // Heuristic intent detection: chỉ trả về posts khi user thật sự muốn hỏi/tìm/so sánh phòng.
  // Tránh trường hợp user chào hỏi chung chung nhưng API vẫn trả posts.
  const messageLower = message.toLowerCase();
  const hasRoomContext = Boolean(input.roomId) || Boolean(input.compareRoomIds?.length);
  const isSearchIntent = /(tìm|tim|gợi ý|goi y|đề xuất|de xuat|phòng|phong|trọ|tro|so sánh|so sanh|near|gần|gan)/i.test(messageLower);

  // 1) Query DB first
  const currentRoom = input.roomId ? await getPostByIdLean(input.roomId) : null;
  const compareRooms = input.compareRoomIds?.length ? await getPostsByIdsLean(input.compareRoomIds, 6) : [];

  // If user doesn't provide explicit room(s), try to fetch some candidates to let AI suggest from real data.
  // This is best-effort and safe: if nothing found, context stays empty and AI must say not enough info.
  const shouldSuggest = !currentRoom && compareRooms.length === 0;
  const suggestedRooms = shouldSuggest && isSearchIntent ? await searchSuggestedPosts(message, 6) : [];

  // 2) Build prompt with strict grounding
  const system = buildChatbotSystemInstruction();
  const context = buildRoomsContext({
    currentRoom,
    compareRooms,
    suggestedRooms,
  });
  const userPrompt = [context, "", buildUserPrompt(message)].join("\n");

  // 3) Call Gemini
  const reply = await geminiGenerateText({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  // Nếu maxOutputTokens thấp, Gemini có thể bị cắt cụt giữa câu.
  generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
  });

  // If Gemini returns empty (rare), provide deterministic fallback.
  if (!reply) {
    return { reply: "Mình chưa nhận được phản hồi từ AI. Bạn thử lại giúp mình nhé." };
  }

  // 4) Provide structured posts for FE rendering (ground-truth from DB)
  // Priority: compareRooms/currentRoom/suggestedRooms (avoid duplicates)
  // Nếu không có ý định liên quan post, trả posts rỗng.
  if (!hasRoomContext && !isSearchIntent) {
    return { reply, posts: [] } as any;
  }

  // Nếu có ý định tìm phòng nhưng không tìm được data thật trong DB, vẫn trả posts rỗng.
  // (AI sẽ nói rõ không đủ dữ liệu hoặc gợi ý cách hỏi cụ thể hơn.)
  if (!hasRoomContext && isSearchIntent && suggestedRooms.length === 0) {
    return { reply, posts: [] } as any;
  }

  const merged: IPost[] = [];
  const pushUnique = (p?: IPost | null) => {
    if (!p) return;
    const id = (p as any)._id?.toString?.() || "";
    if (!id) return;
    if (merged.some((x) => (x as any)._id?.toString?.() === id)) return;
    merged.push(p);
  };

  compareRooms.forEach((p) => pushUnique(p));
  pushUnique(currentRoom);
  suggestedRooms.forEach((p) => pushUnique(p));

  const posts: ChatbotPostCard[] = merged.slice(0, 6).map((p) => ({
    _id: (p as any)._id?.toString?.() || "",
    title: (p as any).title || "",
    price: Number((p as any).price) || 0,
    city: (p as any).city || "",
    district: (p as any).district || "",
    ward: (p as any).ward,
    address: (p as any).address || "",
    images: Array.isArray((p as any).images) ? (p as any).images : [],
    available: Boolean((p as any).available),
  }));

  // If the model listed explicit ids in the reply, only return those posts
  // so FE doesn't show extra cards unrelated to what the user just saw.
  const idsInReply = Array.from(new Set((reply.match(/\b[a-f0-9]{24}\b/gi) || []).map((s) => s.toLowerCase())));
  if (idsInReply.length) {
    const map = new Map(posts.map((p) => [p._id.toLowerCase(), p]));
    const ordered = idsInReply.map((id) => map.get(id)).filter(Boolean) as ChatbotPostCard[];
    // Only override if we can map at least 1 id to a real post we queried.
    if (ordered.length) {
      return { reply, posts: ordered } as any;
    }
  }

  return { reply, posts } as any;
}
