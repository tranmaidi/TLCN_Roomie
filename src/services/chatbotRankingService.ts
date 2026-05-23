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

const RANK_DEBUG = (process.env.CHATBOT_RANK_DEBUG || "").toString().toLowerCase() === "true";

function dlog(...args: any[]) {
  if (!RANK_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log("[chatbotRanking]", ...args);
}

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
    "Bạn PHẢI trả về JSON hợp lệ (không markdown, không code-fence).",
    "Schema JSON:",
    "{",
    '  "reply": "<plain text>",',
    '  "ranked": [',
    '    { "id": "<mongo_object_id>", "reason": "<1 câu, dựa vào dữ liệu>" }',
    "  ]",
    "}",
    "- reply: plain text tiếng Việt, ngắn gọn, không bắt đầu bằng từ 'json'.",
    "- ranked: chọn tối đa 3 phòng phù hợp nhất trong ROOMS, KHÔNG chọn id ngoài danh sách.",
    "- reason: <= 1 câu và phải dựa vào field thật: price, address/city/district, superficies, description.",
  ].join("\n");
}

function stripCodeFences(text: string): string {
  return (text || "").replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "").trim();
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

function extractReplyFromJsonish(raw: string): string {
  const cleaned = stripCodeFences(raw);
  const parsed = safeJsonParse<any>(cleaned);
  if (typeof parsed?.reply === "string" && parsed.reply.trim()) return parsed.reply.trim();

  const m = cleaned.match(/"reply"\s*:\s*"([\s\S]*?)"\s*(,|\}|\n)/i);
  if (m?.[1]) return m[1].replace(/\\n/g, "\n").trim();

  return cleaned.trim();
}

function buildRoomsBlock(posts: IPost[]): string {
  const lines = posts.slice(0, 12).map((p: any, idx) => {
    const desc = safeString(p?.description).replace(/\s+/g, " ").slice(0, 220);
    return [
      `${idx + 1}. id:${p?._id}`,
      `title:${safeString(p?.title)}`,
      `price:${formatMoneyVND(Number(p?.price))}`,
      `city:${safeString(p?.city)}`,
      `district:${safeString(p?.district)}`,
      `address:${safeString(p?.address)}`,
      `superficies:${safeString(p?.superficies)}`,
      `available:${safeString(p?.available)}`,
      `desc:${desc}`,
    ].join(" | ");
  });

  return ["ROOMS:", ...lines].join("\n");
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
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
  });

  const cleanedRaw = stripCodeFences(raw || "");
  const parsed = safeJsonParse<any>(cleanedRaw);
  const reply = extractReplyFromJsonish(cleanedRaw);

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

  dlog("Model raw:", raw);
  dlog(
    "Ranked ids:",
    ranked.map((r: any) => ({ id: r.post?._id?.toString?.() || String(r.post?._id), reason: r.reason }))
  );

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
