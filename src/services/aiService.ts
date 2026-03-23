import { OpenAI } from "openai";
import Interaction from "../models/Interaction";
import User from "../models/User";
import Survey from "../models/Survey";
import mongoose from "mongoose";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-3.5-turbo";

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

/* call OpenAI with simple retry/backoff for 429/RateLimit */
async function callOpenAIWithRetries(messages: any[], maxRetries = 3) {
  let attempt = 0;
  let lastErr: any = null;
  const backoffs = [500, 1000, 2000]; // ms

  while (attempt <= maxRetries) {
    try {
      return await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.0,
        max_tokens: 300,
      });
    } catch (err: any) {
      lastErr = err;

      const status = err?.status;
      const code = err?.code;

      // quota exhausted: do not retry
      if (code === "insufficient_quota") {
        throw err;
      }

      // retry only on 429 / rate limit
      if (status === 429 || code === "RateLimitError") {
        if (attempt === maxRetries) break;
        const wait = backoffs[Math.min(attempt, backoffs.length - 1)];
        await sleep(wait);
        attempt++;
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

/* fallback deterministic rank when OpenAI unavailable */
function fallbackRerank(candidates: any[], query?: string, interactions: any[] = [], survey: any = null) {
  const q = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const recentQueries = interactions.map((it: any) => (it.query || "").toLowerCase()).join(" ");

  return [...candidates]
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
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post);
}

async function getRecentInteractions(userId: string, limit = 6) {
  return Interaction.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

// Simple in-memory cache with TTL (process-local)
type CacheVal = { resultIds: string[]; expireAt: number };
const rerankCache = new Map<string, CacheVal>();
function cacheKey(userId: string, query: string | undefined, candidateIds: string[]) {
  const idsHash = candidateIds.join(",");
  return `${userId}::${query || ""}::${idsHash}`;
}
function getFromCache(key: string) {
  const v = rerankCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expireAt) {
    rerankCache.delete(key);
    return null;
  }
  return v.resultIds;
}
function setCache(key: string, ids: string[], ttlMs = 1000 * 60 * 2) {
  rerankCache.set(key, { resultIds: ids, expireAt: Date.now() + ttlMs });
}

export async function rerankPostsByUser(userId: string | undefined, query: string | undefined, candidates: any[]) {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "none") {
    try {
      const interactions = userId ? await getRecentInteractions(userId, 6) : [];
      const survey = userId ? await Survey.findOne({ user: userId }).lean() : null;
      return fallbackRerank(candidates, query, interactions, survey);
    } catch {
      return candidates;
    }
  }

  if (!userId || !candidates || candidates.length < 3) {
    return candidates;
  }

  const candLimited = candidates.slice(0, 30);
  const candidateIds = candLimited.map((p: any) => p._id?.toString?.()).filter(Boolean);
  const key = cacheKey(userId, query, candidateIds);

  const cached = getFromCache(key);
  if (cached) {
    const orderMap = new Map<string, number>();
    cached.forEach((id, idx) => orderMap.set(id, idx));
    const sorted = [...candLimited].sort((a: any, b: any) => {
      const ia = orderMap.has(a._id.toString()) ? orderMap.get(a._id.toString())! : 9999;
      const ib = orderMap.has(b._id.toString()) ? orderMap.get(b._id.toString())! : 9999;
      return ia - ib;
    });
    return sorted.concat(candidates.slice(candLimited.length));
  }

  try {
    const user = await User.findById(userId).select("name introduce").lean();
    const interactions = await getRecentInteractions(userId, 6);

    // fetch survey (if any) and create short summary for prompt
    const survey = await Survey.findOne({ user: userId }).lean();
    const surveySummary = survey && (survey.skipped ? "survey:skipped" : `survey:${JSON.stringify(survey.answers).slice(0,300)}`);

    const hasQuerySignal = !!(query && query.trim());
    const hasHistorySignal = (interactions || []).length >= 2;
    if (!hasQuerySignal && !hasHistorySignal && !survey) {
      // nothing to personalize
      return candidates;
    }

    const candText = candLimited
      .map((p: any, i: number) => {
        const snippet = (p.description || "").replace(/\s+/g, " ").slice(0, 120);
        return `${i + 1}. id:${p._id} | title:${p.title || ""} | city:${p.city || ""} | price:${p.price || ""} | desc:${snippet}`;
      })
      .join("\n");

    const userSummary =
      user
        ? `name:${user.name || ""} | intro:${(user.introduce || "").slice(0, 120)}${surveySummary ? " | " + surveySummary : ""}`
        : "unknown";

    const recent = interactions
      .map((it: any) => `${it.type}${it.query ? `("${it.query}")` : it.post ? `(post:${it.post})` : ""}`)
      .join(", ");

    const system = `You are a strict ranking assistant.`;
    const userMsg =
      `User: ${userSummary}\nRecent interactions: ${recent}\nSearch query: ${query || ""}\n\n` +
      `Candidates (each line includes an 'id' field which is the MongoDB _id string):\n${candText}\n\n` +
      `Instruction: Return ONLY a JSON array of the candidate _id strings (exact matches to the id values above) in the preferred order, e.g. ["692...", "691...", ...]. Do not include any other text, numbers, or commentary.`;

    const resp = await callOpenAIWithRetries(
      [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      2
    );

    const content = resp.choices?.[0]?.message?.content || "";

    let idList: string[] = [];
    try {
      const jsonStart = content.indexOf("[");
      const jsonText = jsonStart >= 0 ? content.slice(jsonStart) : content;
      idList = JSON.parse(jsonText);
      if (!Array.isArray(idList)) throw new Error("parsed not array");
    } catch {
      const maybeIds = Array.from(
        new Set((content.match(/"[a-f0-9]{24}"/g) || []).map((s: any) => s.replace(/"/g, "")))
      );
      if (maybeIds.length) idList = maybeIds;
      else return fallbackRerank(candidates, query, interactions);
    }

    const filteredIds = idList.filter((id) => candidateIds.includes(id));
    if (!filteredIds.length) {
      return fallbackRerank(candidates, query, interactions, survey);
    }

    setCache(key, filteredIds, 1000 * 60 * 2);

    const orderMap = new Map<string, number>();
    filteredIds.forEach((id, idx) => orderMap.set(id, idx));
    const sorted = [...candLimited].sort((a: any, b: any) => {
      const ia = orderMap.has(a._id.toString()) ? orderMap.get(a._id.toString())! : 9999;
      const ib = orderMap.has(b._id.toString()) ? orderMap.get(b._id.toString())! : 9999;
      return ia - ib;
    });

    return sorted.concat(candidates.slice(candLimited.length));
  } catch {
    try {
      const interactions = userId ? await getRecentInteractions(userId, 6) : [];
      const survey = userId ? await Survey.findOne({ user: userId }).lean() : null;
      return fallbackRerank(candidates, query, interactions, survey);
    } catch {
      return candidates;
    }
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