import { Request, Response } from "express";
import SurveyTemplate from "../models/SurveyTemplate";

export const SurveyTemplateController = {
  async list(req: Request, res: Response) {
    try {
      const templates = await SurveyTemplate.find().sort({ createdAt: -1 }).lean();
      return res.json({ success: true, data: templates });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { title, description, questions, isActive } = req.body;
      if (!title) return res.status(400).json({ success: false, message: "title required" });

      const doc = await SurveyTemplate.create({
        title,
        description: description || "",
        questions: Array.isArray(questions) ? questions : [],
        isActive: typeof isActive === "boolean" ? isActive : true,
      });

      return res.status(201).json({ success: true, data: doc });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async get(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const doc = await SurveyTemplate.findById(id).lean();
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: doc });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const payload = req.body;
      const doc = await SurveyTemplate.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean();
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: doc });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async remove(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const doc = await SurveyTemplate.findByIdAndDelete(id).lean();
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: doc });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },
};