import { Request, Response } from "express";
import Survey from "../models/Survey";
import SurveyTemplate from "../models/SurveyTemplate";
import { recordInteraction } from "../services/aiService";

export const submitSurvey = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { answers, skipped } = req.body;
    const doc = await Survey.findOneAndUpdate(
      { user: userId },
      { answers: answers || [], skipped: !!skipped, completedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // non-blocking: record interaction for AI signals
    recordInteraction(userId, "survey", { meta: { skipped: !!skipped, answers: answers || [] } }).catch(() => {});

    return res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const getStatus = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const s = await Survey.findOne({ user: userId }).lean();
    return res.status(200).json({ done: !!s, skipped: !!s?.skipped });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const getMySurvey = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const s = await Survey.findOne({ user: userId }).lean();
    if (!s) return res.status(404).json({ message: "No survey found" });
    return res.status(200).json({ data: s });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    // trả template active mới nhất (theo createdAt)
    const tpl = await SurveyTemplate.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    if (!tpl) return res.status(404).json({ success: false, message: "No active survey template" });
    return res.status(200).json({ success: true, data: tpl });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
};