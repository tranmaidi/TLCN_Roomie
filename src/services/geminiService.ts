import axios from "axios";

type GeminiRole = "user" | "model";

export type GeminiPart = { text: string };
export type GeminiContent = { role: GeminiRole; parts: GeminiPart[] };

export type GeminiGenerateRequest = {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Thiếu GEMINI_API_KEY trong file .env");
  }
  return key;
}

function getGeminiModel(): string {
  // Ưu tiên dùng env GEMINI_MODEL, và fallback sang model ổn định hơn.
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

function isModelNotFoundError(err: any): boolean {
  const status = err?.response?.status;
  const msg = err?.response?.data?.error?.message || err?.message;
  return status === 404 && typeof msg === "string" && msg.toLowerCase().includes("is not found");
}

const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
];

export async function geminiGenerateText(payload: GeminiGenerateRequest): Promise<string> {
  const apiKey = getGeminiApiKey();
  const preferredModel = getGeminiModel();

  const modelsToTry = [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)];
  let lastErr: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const resp = await axios.post<GeminiGenerateResponse>(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });

      const text = resp.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return text.trim();
    } catch (err: any) {
      lastErr = err;

      // Only fallback when the error indicates the model is not found/unsupported.
      if (isModelNotFoundError(err) && i < modelsToTry.length - 1) {
        continue;
      }

      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status) {
        throw new Error(
          `Gemini API lỗi (HTTP ${status}) [model=${model}]: ${typeof data === "string" ? data : JSON.stringify(data)}`
        );
      }
      throw new Error(`Gemini API lỗi [model=${model}]: ${err?.message || "Unknown error"}`);
    }
  }

  // should not reach here
  throw lastErr || new Error("Gemini API lỗi không xác định");
}
