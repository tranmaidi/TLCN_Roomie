import Post, { IPost } from "../models/Post";
import { removeVietnameseTones } from "../utils/normalizeText";
import type { SearchIntent, SearchPriority } from "./intentParserService";

export type SemanticSearchOptions = {
  limit?: number;
  message?: string;
};

export type SemanticSearchResult = {
  posts: IPost[];
  debug?: {
    usedTextSearch: boolean;
    usedNormalizedRegex: boolean;
    queryTokens: string[];
  };
};

function buildPriorityTokens(priorities: SearchPriority[]): string[] {
  const tokens: string[] = [];
  for (const p of priorities) {
    switch (p) {
      case "cheap":
      case "student":
        tokens.push("giá rẻ", "sinh viên", "budget");
        break;
      case "near_school":
        tokens.push("gần trường", "near school", "di chuyển");
        break;
      case "spacious":
        tokens.push("rộng", "thoáng", "diện tích lớn");
        break;
      case "luxury":
        tokens.push("cao cấp", "premium", "nội thất");
        break;
      case "chill":
        tokens.push("chill", "đẹp", "sạch", "view");
        break;
      case "security":
        tokens.push("an ninh", "yên tĩnh", "khu tốt");
        break;
      case "fit_two_people":
        tokens.push("2 người", "hai người", "ở ghép");
        break;
    }
  }
  return tokens;
}

function splitTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

function makeAnyTokenRegex(tokens: string[]): RegExp | null {
  if (!tokens.length) return null;
  const escaped = tokens.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${escaped.join("|")})`, "i");
}

function cityVariants(city: string): string[] {
  const raw = city.trim();
  const norm = removeVietnameseTones(raw).toLowerCase();

  if (norm.includes("ho chi minh") || norm === "hcm" || norm.includes("tphcm")) {
    return ["Hồ Chí Minh", "Thành phố Hồ Chí Minh", "TP. Hồ Chí Minh", "TP Hồ Chí Minh", "TPHCM", "HCM"];
  }
  if (norm.includes("ha noi")) {
    return ["Hà Nội", "Thành phố Hà Nội", "TP. Hà Nội", "TP Hà Nội"];
  }
  return [raw];
}

export async function searchSuggestedPostsSemantic(intent: SearchIntent, opts: SemanticSearchOptions = {}): Promise<SemanticSearchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);

  const baseFilter: any = {
    statusApproval: true,
    available: true,
  };

  if (intent.city) baseFilter.city = { $in: cityVariants(intent.city) };
  if (intent.district) baseFilter.district = intent.district;
  if (intent.ward) baseFilter.ward = intent.ward;

  // price
  if (intent.minPrice || intent.maxPrice) {
    baseFilter.price = {
      ...(intent.minPrice ? { $gte: intent.minPrice } : {}),
      ...(intent.maxPrice ? { $lte: intent.maxPrice } : {}),
    };
  }

  // area
  if (intent.minArea || intent.maxArea) {
    baseFilter.superficies = {
      ...(intent.minArea ? { $gte: intent.minArea } : {}),
      ...(intent.maxArea ? { $lte: intent.maxArea } : {}),
    };
  }

  const rawMessage = (opts.message || "").trim();
  const messageTokensOriginal = rawMessage ? splitTokens(rawMessage.toLowerCase()) : [];

  const tokensOriginal = [
    ...intent.keywords,
    ...buildPriorityTokens(intent.priorities),
    ...messageTokensOriginal,
  ]
    .map((t) => t.toString().trim())
    .filter(Boolean);

  const queryTokens = Array.from(new Set(tokensOriginal)).slice(0, 16);

  let usedTextSearch = false;
  let usedNormalizedRegex = false;

  const orBlocks: any[] = [];

  const textSearchQuery = rawMessage && rawMessage.length >= 6 ? rawMessage : queryTokens.join(" ");

  if (textSearchQuery.trim()) {
    usedTextSearch = true;
    // mongoose $text uses the collection's text index.
    orBlocks.push({ $text: { $search: textSearchQuery } });
  }

  // searchNormalized fallback
  const normalizedTokens = queryTokens.map((t) => removeVietnameseTones(t.toLowerCase()));
  const rx = makeAnyTokenRegex(normalizedTokens);
  if (rx) {
    usedNormalizedRegex = true;
    orBlocks.push({ searchNormalized: rx });
    orBlocks.push({ title: rx });
    orBlocks.push({ description: rx });
    orBlocks.push({ address: rx });
  }

  const finalFilter = {
    ...baseFilter,
    ...(orBlocks.length ? { $or: orBlocks } : {}),
  };

  const projection: any = {};
  if (usedTextSearch) {
    projection.score = { $meta: "textScore" };
  }

  const q = Post.find(finalFilter, projection);

  if (usedTextSearch) {
    q.sort({ score: { $meta: "textScore" }, createdAt: -1 });
  } else {
    q.sort({ createdAt: -1 });
  }

  const posts = await q.limit(limit).lean();

  // Debug logs to verify $text is actually being executed.
  if ((process.env.CHATBOT_RANK_DEBUG || "").toString().toLowerCase() === "true") {
    console.log("[semanticSearch] usedTextSearch=", usedTextSearch, "usedNormalizedRegex=", usedNormalizedRegex);
    console.log("[semanticSearch] textSearchQuery=", textSearchQuery);
    console.log("[semanticSearch] queryTokens=", queryTokens);
    console.log("[semanticSearch] finalFilter=", JSON.stringify(finalFilter));
    console.log(
      "[semanticSearch] candidates=",
      posts.map((p: any) => ({
        id: p?._id?.toString?.(),
        title: p?.title,
        city: p?.city,
        district: p?.district,
        price: p?.price,
      }))
    );
  }

  return {
    posts,
    debug: {
      usedTextSearch,
      usedNormalizedRegex,
      queryTokens,
    },
  };
}
