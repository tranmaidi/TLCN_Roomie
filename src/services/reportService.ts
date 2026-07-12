import mongoose from "mongoose";
import Report, { ReportReason } from "../models/Report";
import Post from "../models/Post";
import User from "../models/User";

function assertObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${name} không hợp lệ`);
  }
}

export const ReportService = {
  async createReport(params: { postId: string; reporterId: string; reason: ReportReason }) {
    const { postId, reporterId, reason } = params;

    assertObjectId(postId, "postId");
    assertObjectId(reporterId, "reporterId");

    const post = await Post.findById(postId).select("_id title owner");
    if (!post) throw new Error("Bài viết không tồn tại");

    // tạo report (unique index sẽ chặn trùng)
    try {
      const report = await Report.create({
        post: new mongoose.Types.ObjectId(postId),
        reporter: new mongoose.Types.ObjectId(reporterId),
        reason,
      });

      const populated = await Report.findById(report._id)
        .populate("post", "title price city district ward address owner images")
        .populate("reporter", "name email avatar role");

      // chuẩn bị payload realtime cho admin
      const reporter = (populated as any)?.reporter;
      const payload = {
        type: "NEW_REPORT",
        reportId: (report._id as mongoose.Types.ObjectId).toString(),
        postId: postId,
        reason,
        status: report.status,
        reporter: reporter
          ? {
              _id: reporter._id,
              name: reporter.name,
              email: reporter.email,
              avatar: reporter.avatar,
            }
          : undefined,
        createdAt: report.createdAt,
      };

      return { report: populated, adminPayload: payload };
    } catch (err: any) {
      // duplicate key => đã report rồi
      if (err?.code === 11000) {
        throw new Error("Bạn đã báo cáo bài viết này trước đó");
      }
      throw err;
    }
  },

  async getAllAdminReports(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { status: { $ne: "Đã xử lý" } };

    const [rows, total] = await Promise.all([
      Report.find(filter)
        .populate("post", "title price city district ward address owner images")
        .populate("reporter", "name email avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    return {
      content: rows,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async markAsProcessed(reportId: string) {
    assertObjectId(reportId, "reportId");

    const report = await Report.findById(reportId);
    if (!report) throw new Error("Báo cáo không tồn tại");

    const wasAlreadyProcessed = report.status === "Đã xử lý";
    if (!wasAlreadyProcessed) {
      report.status = "Đã xử lý";
      await report.save();
    }

    const populated = await Report.findById(report._id)
      .populate("post", "title price city district ward address owner images")
      .populate("reporter", "name email avatar");

    return { report: populated, wasAlreadyProcessed };
  },

  async getAdminIds() {
    const admins = await User.find({ role: "admin" }).select("_id");
    return admins.map((a) => a._id.toString());
  },
};
