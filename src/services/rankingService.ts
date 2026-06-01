import Interaction from "../models/Interaction";
import Survey from "../models/Survey";
import mongoose from "mongoose";
import Favorite from "../models/Favorite";
import Post from "../models/Post";
import { removeVietnameseTones } from "../utils/normalizeText";

/* helper: sleep */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recordInteraction(
  userId: string,
  type: string,
  opts: { query?: string; postId?: string; meta?: any } = {}
) {
  const payload: any = {
    type,
    query: opts.query,
    post: opts.postId,
    meta: opts.meta,
  };

  if (mongoose.isValidObjectId(userId)) payload.user = new mongoose.Types.ObjectId(userId);
  else payload.user = userId;

  return Interaction.create(payload);
}

/* fallback local scoring + rerank */
function fallbackRerank(candidates: any[], query?: string, interactions: any[] = [], survey: any = null) {
  const q = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const recentQueries = interactions.map((it: any) => (it.query || "").toLowerCase()).join(" ");

  const scored = [...candidates]
  .map((p: any) => {
      let score = 0;
      const title = (p.title || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const city = (p.city || "").toString().toLowerCase();
      const categoryName = (p.category && (p.category.name || p.category).toString().toLowerCase()) || "";

      // token match from query
      for (const token of q) {
        if (title.includes(token)) score += 30;
        else if (desc.includes(token)) score += 15;
      }

      // recent queries
      for (const rq of recentQueries.split(/\s+/).filter(Boolean)) {
        if (title.includes(rq)) score += 8;
        if (desc.includes(rq)) score += 4;
      }

      // use survey signals (simple heuristics)
      if (survey && Array.isArray(survey.answers)) {
        for (const ans of survey.answers) {
          const qid = (ans.questionId || "").toString().toLowerCase();
          const val = (ans.value || "").toString().toLowerCase();

          if (!val) continue;

          // city preference
          if (qid.includes("city") || qid.includes("location")) {
            if (city && city.includes(val)) score += 50;
            else if (title.includes(val) || desc.includes(val)) score += 20;
          }

          // category preference
          if (qid.includes("category") || qid.includes("type")) {
            if (categoryName && categoryName.includes(val)) score += 40;
            else if (title.includes(val) || desc.includes(val)) score += 15;
          }

          // price preference (basic handling for ranges like "<500", "500-1000", ">1000")
          if (qid.includes("price") || qid.includes("budget")) {
            const priceVal = Number(p.price);
            if (!isNaN(priceVal)) {
              if (typeof ans.value === "string") {
                const v = ans.value;
                if (v.includes("<")) {
                  const n = Number(v.replace(/[^0-9]/g, ""));
                  if (!isNaN(n) && priceVal <= n) score += 30;
                } else if (v.includes(">")) {
                  const n = Number(v.replace(/[^0-9]/g, ""));
                  if (!isNaN(n) && priceVal >= n) score += 30;
                } else if (v.includes("-")) {
                  const parts = v.split("-").map((s: string) => Number(s.replace(/[^0-9]/g, "")));
                  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && priceVal >= parts[0] && priceVal <= parts[1]) score += 30;
                }
              }
            }
          }
        }
      }

      return { post: p, score };
    })
    .sort((a, b) => b.score - a.score);

  // ai_score là điểm thực (raw score) được tính từ signals
  for (const s of scored) {
    try {
      s.post.ai_score = s.score;
    } catch {}
  }

  return scored.map((s) => s.post);
}

async function getRecentInteractions(userId: string, limit = 6) {
  return Interaction.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

type FavoriteProfile = {
  favoriteIds: Set<string>;
  cityCounts: Map<string, number>;
  districtCounts: Map<string, number>;
  wardCounts: Map<string, number>;
  titleTokens: Set<string>;
  descTokens: Set<string>;
};

function tokenizeVietnamese(text: string): string[] {
  const norm = removeVietnameseTones((text || "").toLowerCase());
  return norm
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

async function loadFavoriteProfile(userId: string, maxFav = 80): Promise<FavoriteProfile> {
  const favDocs = await Favorite.find({ user: userId }).sort({ createdAt: -1 }).limit(maxFav).select("post").lean();
  const favIds = favDocs.map((d: any) => d?.post?.toString?.()).filter(Boolean);
  const favoriteIds = new Set<string>(favIds);

  const cityCounts = new Map<string, number>();
  const districtCounts = new Map<string, number>();
  const wardCounts = new Map<string, number>();
  const titleTokens = new Set<string>();
  const descTokens = new Set<string>();

  if (!favIds.length) {
    return { favoriteIds, cityCounts, districtCounts, wardCounts, titleTokens, descTokens };
  }

  const posts = await Post.find({ _id: { $in: favIds } })
    .select("title description city district ward")
    .lean();

  for (const p of posts as any[]) {
    const city = (p?.city || "").toString().trim();
    const district = (p?.district || "").toString().trim();
    const ward = (p?.ward || "").toString().trim();

    if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    if (district) districtCounts.set(district, (districtCounts.get(district) || 0) + 1);
    if (ward) wardCounts.set(ward, (wardCounts.get(ward) || 0) + 1);

    for (const t of tokenizeVietnamese(p?.title || "")) titleTokens.add(t);
    for (const t of tokenizeVietnamese(p?.description || "")) descTokens.add(t);
  }

  return { favoriteIds, cityCounts, districtCounts, wardCounts, titleTokens, descTokens };
}

function applyFavoriteSimilarityBoost(candidates: any[], profile: FavoriteProfile) {
  if (!profile || profile.favoriteIds.size === 0) return;

  const topCity = [...profile.cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topDistrict = [...profile.districtCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topWard = [...profile.wardCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const topCitySet = new Set(topCity.map((x) => x[0]));
  const topDistrictSet = new Set(topDistrict.map((x) => x[0]));
  const topWardSet = new Set(topWard.map((x) => x[0]));

  for (const p of candidates || []) {
    const id = p?._id?.toString?.() || "";
    let boost = 0;

    // 1) favorite direct
    if (id && profile.favoriteIds.has(id)) boost += 120;

    // 2) same location cluster signals
    const city = (p?.city || "").toString().trim();
    const district = (p?.district || "").toString().trim();
    const ward = (p?.ward || "").toString().trim();

    if (city && topCitySet.has(city)) boost += 40;
    if (district && topDistrictSet.has(district)) boost += 55;
    if (ward && topWardSet.has(ward)) boost += 30;

    // 3) text similarity via token overlap (normalized no-diacritics)
    const titleTokens = tokenizeVietnamese(p?.title || "");
    const descTokens = tokenizeVietnamese(p?.description || "");
    let overlap = 0;
    for (const t of titleTokens) if (profile.titleTokens.has(t)) overlap += 6;
    for (const t of descTokens) if (profile.descTokens.has(t)) overlap += 2;
    boost += Math.min(overlap, 80);

    if (boost) {
      try {
        // ai_score là điểm thực => cộng trực tiếp boost
        p.ai_score = (p.ai_score || 0) + boost;
      } catch {}
    }
  }
}

export async function rerankPostsByUser(userId: string | undefined, query: string | undefined, candidates: any[]) {
  const debug = (process.env.AI_DEBUG || "").toString().toLowerCase() === "true";
  const dlog = (...args: any[]) => {
    if (debug) console.log("[aiService:rerank]", ...args);
  };

  try {
    dlog("local-only rerank", {
      userId: userId ? "yes" : "no",
      query: (query || "").slice(0, 80),
      candidates: Array.isArray(candidates) ? candidates.length : 0,
    });

    // Flow:
    // 1) interactions
    // 2) survey
    // 3) fallbackRerank -> base ai_score (real score)
    // 4) loadFavoriteProfile
    // 5) applyFavoriteSimilarityBoost -> cộng vào ai_score
    // 6) sort theo ai_score desc
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) return candidates;

    const interactions = userId ? await getRecentInteractions(userId, 6) : [];
    const survey = userId ? await Survey.findOne({ user: userId }).lean() : null;
    const ordered = fallbackRerank(candidates, query, interactions, survey);

    const profile = userId ? await loadFavoriteProfile(userId, 80) : null;
    if (profile) applyFavoriteSimilarityBoost(ordered, profile);

    // final sort by real ai_score
    const sorted = [...ordered].sort((a: any, b: any) => {
      const sa = typeof a?.ai_score === "number" ? a.ai_score : 0;
      const sb = typeof b?.ai_score === "number" ? b.ai_score : 0;
      return sb - sa;
    });

    return sorted;
  } catch (err: any) {
    dlog("local rerank failed -> return original candidates", {
      message: err?.message,
    });
    return candidates;
  }
}

export async function getLatestSearchQuery(userId: string) {
  const latest = await Interaction.findOne({
    user: userId,
    type: "search",
    query: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .lean();

  return latest?.query as string | undefined;
}