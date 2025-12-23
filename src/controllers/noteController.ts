import { Request, Response, NextFunction } from "express";
import noteService from "../services/noteService";

function getUserIdFromReq(req: Request) {
  // Thích nghi với authMiddleware của dự án:
  // try common shapes: req.userId, req.user._id, req.user
  // @ts-ignore
  return (req as any).userId || (req as any).user?.id || (req as any).user?._id || (req as any).user || (req.headers["x-user-id"] as string);
}

const noteController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromReq(req);
      const { start, end } = req.query as { start?: string; end?: string };
      const data = await noteService.listByUser(userId, start, end);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromReq(req);
      const { date } = req.params;
      const data = await noteService.getByDate(userId, date);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async createItems(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { date, items } = req.body;
      if (!date || !Array.isArray(items)) return res.status(400).json({ success: false, message: "date và items là bắt buộc" });
      const data = await noteService.createItems(userId, date, items);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromReq(req);
      const { id } = req.params;
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ success: false, message: "items là bắt buộc" });
      const data = await noteService.updateItems(id, userId, items);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromReq(req);
      const { id } = req.params;
      await noteService.remove(id, userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};

export default noteController;