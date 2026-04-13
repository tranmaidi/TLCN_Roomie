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

  // GET /api/admin/revenue/subscriptions?year=2026&month=4
  static async revenueFromSubscriptions(req: Request, res: Response) {
    try {
      const yearRaw = (req.query as any)?.year;
      const monthRaw = (req.query as any)?.month;

      const year = parseInt(String(yearRaw), 10);
      const month = monthRaw !== undefined ? parseInt(String(monthRaw), 10) : undefined;

      if (!yearRaw || Number.isNaN(year)) {
        return res.status(400).json({ success: false, message: "year is required" });
      }

      const data = await AdminService.getRevenueFromSubscriptions({ year, month });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

}