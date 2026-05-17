import type { IPost } from "../models/Post";
import { geminiGenerateText } from "./geminiService";
import type { SearchIntent } from "./intentParserService";

export type RankedRoom = {
  post: IPost;
  reason: string;
};

export type ChatbotRankingResult = {
  reply: string;
  ranked: RankedRoom[];
};

// const RANK_DEBUG = (process.env.CHATBOT_RANK_DEBUG || "").toString().toLowerCase() === "true";

// function dlog(...args: any[]) {
//   if (!RANK_DEBUG) return;
//   // eslint-disable-next-line no-console
//   console.log("[chatbotRanking]", ...args);
// }

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

function buildRankingSystemInstruction(): string {
  return [
    "Bạn là AI assistant hỗ trợ tư vấn tìm phòng trọ.",
    "Bạn được phép suy luận hợp lý (reasoning) dựa trên dữ liệu trong CONTEXT.",
    "Bạn KHÔNG ĐƯỢC bịa bất kỳ thông tin/tiện ích nào không có trong CONTEXT.",
    "Bạn KHÔNG ĐƯỢC tạo/phỏng đoán dữ liệu phòng (giá/địa chỉ/diện tích/tiện ích).",
    "Nếu dữ liệu không đủ để kết luận, hãy nói rõ và hỏi lại 1-2 câu ngắn.",
    "",
    "Output yêu cầu: trả về JSON hợp lệ theo schema.",
    "Schema:",
    "{",
    '  "reply": string,',
    '  "ranked": [',
    "     {",
    '       "id": string,',
    '       "reason": string',
    "{",
    '  "reply": "...",',
    '  "ranked": [',
    '    { "id": "<mongo_object_id>", "reason": "..." }',
    "  ]",
    "}",
    "- reason ngắn gọn (<= 1 câu) và phải dựa vào field thật: price, address/city/district, superficies, description.",
    "- reply ngắn gọn, tự nhiên, hữu ích.",
    "- Nếu user muốn tìm phòng, hãy chọn tối đa 3 phòng phù hợp nhất.",
  ].join("\n");
}

function buildRoomsBlock(posts: IPost[]): string {
  const lines = posts.slice(0, 12).map((p, idx) => {
    const desc = safeString((p as any).description).replace(/\s+/g, " ").slice(0, 220);
    return [
      `${idx + 1}. id:${(p as any)._id}`,
      `title:${safeString((p as any).title)}`,
      `price:${formatMoneyVND(Number((p as any).price))}`,
      `city:${safeString((p as any).city)}`,
      `district:${safeString((p as any).district)}`,
      `address:${safeString((p as any).address)}`,
      `superficies:${safeString((p as any).superficies)}`,
      `available:${safeString((p as any).available)}`,
      `desc:${desc}`,
    ].join(" | ");
  });

  return ["ROOMS:", ...lines].join("\n");
}

function safeJsonParse<T>(text: string): T | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function rankAndReasonRooms(params: {
  message: string;
  intent: SearchIntent;
  candidates: IPost[];
}): Promise<ChatbotRankingResult> {
  const { message, intent, candidates } = params;

  if (!candidates.length) {
    return {
      reply: "Mình chưa tìm thấy phòng phù hợp trong dữ liệu hiện có. Bạn cho mình thêm khu vực (quận/huyện) và mức giá tối đa nhé.",
      ranked: [],
    };
  }

  const prompt = [
    "USER_MESSAGE:",
    message,
    "",
    "PARSED_INTENT_JSON:",
    JSON.stringify(intent),
    "",
    buildRoomsBlock(candidates),
  ].join("\n");

  const raw = await geminiGenerateText({
    systemInstruction: { parts: [{ text: buildRankingSystemInstruction() }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
  });

  const parsed = safeJsonParse<any>(raw || "");
  const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : (raw || "").trim();

  const allowedIds = new Set(candidates.map((p: any) => p._id?.toString?.()).filter(Boolean));
  const rankedRaw: any[] = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
  const ranked: RankedRoom[] = rankedRaw
    .map((r) => {
      const id = typeof r?.id === "string" ? r.id.trim() : "";
      const reason = typeof r?.reason === "string" ? r.reason.trim() : "";
      if (!id || !allowedIds.has(id)) return null;
      const post = candidates.find((p: any) => p._id?.toString?.() === id);
      if (!post) return null;
      return { post, reason: reason || "Phù hợp nhất trong danh sách hiện có." };
    })
    .filter(Boolean)
    .slice(0, 3) as RankedRoom[];

//   // Debug: print ranking score low -> high (based on AI order)
//   // score = (n - idx) / n, where idx is AI rank index (0 = best)
//   if (ranked.length) {
//     const n = ranked.length;
//     const scored = ranked
//       .map((r, idx) => {
//         const score = n > 0 ? (n - idx) / n : 0;
//         return {
//           id: (r.post as any)._id?.toString?.() || "",
//           title: safeString((r.post as any).title),
//           price: Number((r.post as any).price) || 0,
//           score,
//           reason: r.reason,
//         };
//       })
//       .sort((a, b) => a.score - b.score);

//     dlog("Scores low->high", scored);
//   } else {
//     dlog("No ranked results returned by model; candidates=", candidates.length);
//   }

  return { reply, ranked };
}
