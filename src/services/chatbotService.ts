import mongoose from "mongoose";
import Post, { IPost } from "../models/Post";
import { geminiGenerateText } from "./geminiService";
import { buildChatbotSystemInstruction, buildRoomsContext, buildUserPrompt } from "../utils/chatbotPromptBuilder";
import { parseSearchIntent } from "./intentParserService";
import { searchSuggestedPostsSemantic } from "./semanticSearchService";
import { rankAndReasonRooms } from "./chatbotRankingService";
import { removeVietnameseTones } from "../utils/normalizeText";

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

// (Giữ an toàn: chỉ query dựa trên text, không để AI tự bịa điều kiện.)
async function searchSuggestedPosts(message: string, limit = 6): Promise<IPost[]> {
  const debug = (process.env.CHATBOT_RANK_DEBUG || "").toString().toLowerCase() === "true";
  const q = (message || "").trim();
  if (!q) return [];

  const baseFilter: any = { statusApproval: true, available: true };

  try {
    const postsText = await Post.find(
      { ...baseFilter, $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .limit(limit)
      .lean();

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[chatbotService.searchSuggestedPosts] path=$text", {
        q,
        count: postsText.length,
        ids: postsText.map((p: any) => p?._id?.toString?.()),
      });
    }

    if (postsText.length) return postsText as any;
  } catch (e) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[chatbotService.searchSuggestedPosts] $text failed -> fallback searchNormalized", {
        q,
        message: (e as any)?.message,
      });
    }
  }

  const normalized = removeVietnameseTones(q.toLowerCase());
  const tokens = normalized.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 10);
  if (!tokens.length) return [];
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp(`(${escaped.join("|")})`, "i");

  const postsNorm = await Post.find({ ...baseFilter, searchNormalized: rx })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[chatbotService.searchSuggestedPosts] path=searchNormalized", {
      q,
      normalized,
      tokens,
      count: postsNorm.length,
      ids: postsNorm.map((p: any) => p?._id?.toString?.()),
    });
  }

  return postsNorm as any;
}

export async function chatWithGemini(input: ChatbotRequest): Promise<{ reply: string }> {
  assertNonEmptyString(input.message, "message");

  const message = input.message.trim();

  // Heuristic intent detection: chỉ trả về posts khi user thật sự muốn hỏi/tìm/so sánh phòng.
  const messageLower = message.toLowerCase();
  const hasRoomContext = Boolean(input.roomId) || Boolean(input.compareRoomIds?.length);
  const isSearchIntent = /(tìm|tim|gợi ý|goi y|đề xuất|de xuat|phòng|phong|trọ|tro|so sánh|so sanh|near|gần|gan)/i.test(messageLower);

  const currentRoom = input.roomId ? await getPostByIdLean(input.roomId) : null;
  const compareRooms = input.compareRoomIds?.length ? await getPostsByIdsLean(input.compareRoomIds, 6) : [];

  const shouldSuggest = !currentRoom && compareRooms.length === 0;

  let suggestedRooms: IPost[] = [];
  let parsedIntent: any = null;
  if (shouldSuggest && isSearchIntent) {
    try {
      parsedIntent = await parseSearchIntent({ message, defaultCity: "Hồ Chí Minh" });
      const sem = await searchSuggestedPostsSemantic(parsedIntent, { limit: 10, message });
      suggestedRooms = sem.posts.slice(0, 10);
      // fallback to old regex search if semantic yields nothing
      if (!suggestedRooms.length) {
        suggestedRooms = await searchSuggestedPosts(message, 6);
      }
    } catch {
      // If intent parsing/search fails, fall back to existing safe heuristic.
      suggestedRooms = await searchSuggestedPosts(message, 6);
    }
  }

  
  let reply = "";
  if (!hasRoomContext && isSearchIntent && suggestedRooms.length) {
    const intentForRanking = parsedIntent || (await parseSearchIntent({ message, defaultCity: "Hồ Chí Minh" }));
    const rankedRes = await rankAndReasonRooms({
      message,
      intent: intentForRanking,
      candidates: suggestedRooms,
    });
    reply = rankedRes.reply;

    if (rankedRes.ranked.length) {
      suggestedRooms = rankedRes.ranked.map((r) => r.post);
    } else {
      suggestedRooms = suggestedRooms.slice(0, 6);
    }
  } else {
    const system = buildChatbotSystemInstruction();
    const context = buildRoomsContext({
      currentRoom,
      compareRooms,
      suggestedRooms,
    });
    const userPrompt = [context, "", buildUserPrompt(message)].join("\n");

    reply = await geminiGenerateText({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
    });
  }

  // If Gemini returns empty (rare), provide deterministic fallback.
  if (!reply) {
    return { reply: "Mình chưa nhận được phản hồi từ AI. Bạn thử lại giúp mình nhé." };
  }

  // Nếu không có ý định liên quan post, trả posts rỗng.
  if (!hasRoomContext && !isSearchIntent) {
    return { reply, posts: [] } as any;
  }

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

  const idsInReply = Array.from(new Set((reply.match(/\b[a-f0-9]{24}\b/gi) || []).map((s) => s.toLowerCase())));
  if (idsInReply.length) {
    const map = new Map(posts.map((p) => [p._id.toLowerCase(), p]));
    const ordered = idsInReply.map((id) => map.get(id)).filter(Boolean) as ChatbotPostCard[];
    if (ordered.length) {
      return { reply, posts: ordered } as any;
    }
  }

  return { reply, posts } as any;
}
