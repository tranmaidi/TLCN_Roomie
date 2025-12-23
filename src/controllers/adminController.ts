import { Request, Response } from "express";
import { AdminService } from "../services/adminService";

export class AdminController {
  // GET /api/admin/stats?start=YYYY-MM-DD&end=YYYY-MM-DD
  static async stats(req: Request, res: Response) {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      const data = await AdminService.getStats(start, end);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // GET /api/admin/posts-by-category?start=&end=
  static async postsByCategory(req: Request, res: Response) {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      const data = await AdminService.getPostsCountByCategory(start, end);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}