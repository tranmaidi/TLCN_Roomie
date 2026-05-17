import { geminiGenerateText } from "./geminiService";

export type SearchPriority =
  | "cheap"
  | "student"
  | "near_school"
  | "spacious"
  | "luxury"
  | "chill"
  | "security"
  | "fit_two_people";

export type SearchIntent = {
  city: string | null;
  district: string | null;
  ward?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  keywords: string[];
  priorities: SearchPriority[];
};

type ParseSearchIntentInput = {
  message: string;
  locale?: "vi";
  defaultCity?: string;
};

function safeJsonParse<T>(text: string): T | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    const jsonText = text.slice(start, end + 1);
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

function uniqueStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    if (isFinite(n)) return n;
  }
  return null;
}

function sanitizeIntent(raw: any, fallbackCity: string | undefined): SearchIntent {
  const city = typeof raw?.city === "string" ? raw.city.trim() : raw?.city === null ? null : null;
  const district = typeof raw?.district === "string" ? raw.district.trim() : raw?.district === null ? null : null;
  const ward = typeof raw?.ward === "string" ? raw.ward.trim() : raw?.ward === null ? null : undefined;

  const minPrice = normalizeNumber(raw?.minPrice);
  const maxPrice = normalizeNumber(raw?.maxPrice);
  const minArea = normalizeNumber(raw?.minArea);
  const maxArea = normalizeNumber(raw?.maxArea);

  const keywords = uniqueStrings(raw?.keywords);
  const priorities = uniqueStrings(raw?.priorities) as SearchPriority[];

  const allowed: SearchPriority[] = [
    "cheap",
    "student",
    "near_school",
    "spacious",
    "luxury",
    "chill",
    "security",
    "fit_two_people",
  ];
  const prioritiesFiltered = priorities.filter((p) => allowed.includes(p));

  return {
    city: city || fallbackCity || null,
    district: district || null,
    ward,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    keywords,
    priorities: prioritiesFiltered,
  };
}

function buildIntentParserSystemInstruction(): string {
  return [
    "Bạn là bộ phân tích ý định tìm kiếm phòng trọ.",
    "Nhiệm vụ: chuyển câu người dùng thành JSON theo schema bên dưới.",
    "TUYỆT ĐỐI KHÔNG trả lời dạng hội thoại.",
    "TUYỆT ĐỐI KHÔNG bịa dữ liệu phòng.",
    "Chỉ trích xuất/chuẩn hoá điều kiện lọc và ưu tiên (priorities).",
    "Nếu thiếu thông tin, đặt null hoặc bỏ qua field.",
    "Chỉ output JSON hợp lệ, không thêm chữ khác.",
    "",
    "Schema JSON:",
    "{",
    '  "city": string|null,',
    '  "district": string|null,',
    '  "ward": string|null,',
    '  "minPrice": number|null,',
    '  "maxPrice": number|null,',
    '  "minArea": number|null,',
    '  "maxArea": number|null,',
    '  "keywords": string[],',
    '  "priorities": string[]',
    "}",
    "",
    "Mapping ngữ nghĩa (priorities):",
    "- 'giá sinh viên' => maxPrice khoảng 3000000 và thêm priorities: ['cheap','student']",
    "- 'phòng rộng' => thêm priority 'spacious' (có thể set minArea nếu user nói rõ)",
    "- 'gần trường'/'gần UTE' => thêm priority 'near_school' và đưa tên trường vào keywords",
    "- 'cao cấp'/'premium' => priority 'luxury'",
    "- 'phòng chill' => priority 'chill'",
    "- 'an ninh'/'khu an ninh' => priority 'security'",
    "- 'ở được 2 người'/'2 người' => priority 'fit_two_people'",
  ].join("\n");
}

function buildIntentParserUserPrompt(message: string, defaultCity?: string): string {
  return [
    `DEFAULT_CITY: ${defaultCity || "(none)"}`,
    "USER_QUERY:",
    message,
    "",
    "Yêu cầu:",
    "- Trả về JSON theo schema.",
    "- Giá (price) dùng VND (ví dụ 3000000).",
    "- Nếu user nhắc quận/huyện/phường xã, đưa vào district/ward nếu rõ.",
  ].join("\n");
}

export async function parseSearchIntent(input: ParseSearchIntentInput): Promise<SearchIntent> {
  const message = (input.message || "").trim();
  if (!message) {
    return {
      city: input.defaultCity || null,
      district: null,
      ward: null,
      keywords: [],
      priorities: [],
    };
  }

  const raw = await geminiGenerateText({
    systemInstruction: { parts: [{ text: buildIntentParserSystemInstruction() }] },
    contents: [{ role: "user", parts: [{ text: buildIntentParserUserPrompt(message, input.defaultCity) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
    },
  });

  const parsed = safeJsonParse<any>(raw || "") || {};
  return sanitizeIntent(parsed, input.defaultCity);
}
