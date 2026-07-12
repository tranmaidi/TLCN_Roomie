import { Request, Response } from "express";
import { ReportReason } from "../models/Report";
import { ReportService } from "../services/reportService";
import { NotificationService } from "../services/notificationService";

const allowedReasons: ReportReason[] = ["Spam", "Lừa đảo", "Nội dung không phù hợp", "Tin giả", "Khác"];

export class ReportController {
  // POST /api/reports
  static async create(req: Request & { user?: any }, res: Response) {
    try {
      const reporterId = req.user?.id;
      if (!reporterId) return res.status(401).json({ message: "Unauthorized" });

      const { postId, reason } = req.body as { postId?: string; reason?: ReportReason };

      if (!postId) return res.status(400).json({ message: "postId required" });
      if (!reason) return res.status(400).json({ message: "reason required" });
      if (!allowedReasons.includes(reason)) return res.status(400).json({ message: "reason không hợp lệ" });

      const io = req.app.get("io");
  const { report } = await ReportService.createReport({
        postId,
        reporterId,
        reason,
      });

      // tạo notification cho admin + emit realtime theo pattern hiện tại
      const adminIds = await ReportService.getAdminIds();
      await Promise.all(
        adminIds.map((adminId) =>
          NotificationService.createAndEmit(
            {
              user: adminId,
              type: "system",
              content: `Có báo cáo mới (${reason}) cho bài viết`,
              post: postId,
            },
            io,
            "newNotification"
          )
        )
      );

      return res.status(201).json({ success: true, data: report });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /api/reports/admin/all?page=&limit=
  static async adminGetAll(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const data = await ReportService.getAllAdminReports(page, limit);
      return res.json({ success: true, ...data });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /api/reports/admin/:reportId/processed
  static async adminMarkProcessed(req: Request & { user?: any }, res: Response) {
    try {
      const { reportId } = req.params;
      const io = req.app.get("io");

      const { report, wasAlreadyProcessed } = await ReportService.markAsProcessed(reportId);
      const populatedReport = report as any;
      const reporterId = populatedReport?.reporter?._id?.toString?.() || populatedReport?.reporter?.toString?.();
      const postId = populatedReport?.post?._id?.toString?.() || populatedReport?.post?.toString?.();

      if (!wasAlreadyProcessed && reporterId) {
        await NotificationService.createAndEmit(
          {
            user: reporterId,
            sender: req.user?.id,
            type: "system",
            content: "Report của bạn đã được xử lý.",
            post: postId,
          },
          io,
          "newNotification"
        );
      }

      return res.json({
        success: true,
        message: wasAlreadyProcessed ? "Báo cáo đã được xử lý trước đó" : "Đã đánh dấu báo cáo đã xử lý",
        data: report,
      });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
