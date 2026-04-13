import mongoose from "mongoose";
import User from "../models/User";
import Post from "../models/Post";
import Conversation from "../models/Conversation";
import Message from "../models/Message";
import Note from "../models/Note";
import Favorite from "../models/Favorite";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import { generatePdfReport, generateDocxReport } from "../utils/reportUtil";

type Period = { start?: Date; end?: Date };

function toPeriod(start?: string, end?: string): Period {
  const out: Period = {};
  if (start) out.start = new Date(start);
  if (end) out.end = new Date(end);
  return out;
}

export const AdminService = {
  async getStats(start?: string, end?: string) {
    const { start: s, end: e } = toPeriod(start, end);
    const rangeQuery = (field = "createdAt") => {
      if (s && e) return { [field]: { $gte: s, $lte: e } };
      if (s) return { [field]: { $gte: s } };
      if (e) return { [field]: { $lte: e } };
      return {};
    };

    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments(rangeQuery("createdAt"));
    const activeUsers = await User.countDocuments({ isOnline: true });

    const totalPosts = await Post.countDocuments();
    const postsInPeriod = await Post.countDocuments(rangeQuery("createdAt"));

    const totalConversations = await Conversation.countDocuments();
    const messagesInPeriod = await Message.countDocuments(rangeQuery("createdAt"));
    const totalMessages = await Message.countDocuments();

    const notesInPeriod = await Note.countDocuments(rangeQuery("createdAt"));
    const totalNotes = await Note.countDocuments();

    const favoritesInPeriod = await Favorite.countDocuments(rangeQuery("createdAt"));
    const totalFavorites = await Favorite.countDocuments();

    const totalCategories = await Category.countDocuments();

    // top users by posts (simple)
    const topUsersByPosts = await Post.aggregate([
      { $match: s || e ? { ...(s ? { createdAt: { $gte: s } } : {}), ...(e ? { createdAt: { $lte: e } } : {}) } : {} },
      { $group: { _id: "$user", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, userId: "$user._id", name: "$user.name", avatar: "$user.avatar", count: 1 } },
    ]);

    return {
      period: { start: s, end: e },
      users: { total: totalUsers, new: newUsers, active: activeUsers },
      posts: { total: totalPosts, period: postsInPeriod },
      conversations: { total: totalConversations },
      messages: { total: totalMessages, period: messagesInPeriod },
      notes: { total: totalNotes, period: notesInPeriod },
      favorites: { total: totalFavorites, period: favoritesInPeriod },
      categories: { total: totalCategories },
      topUsersByPosts,
      generatedAt: new Date(),
    };
  },

  // trả tổng số bài theo từng danh mục (bao gồm danh mục có 0 bài)
  async getPostsCountByCategory(start?: string, end?: string) {
    const matchRange: any = {};
    if (start) matchRange.$gte = new Date(start);
    if (end) {
      // đặt end tới cuối ngày để inclusive
      const e = new Date(end);
      e.setHours(23, 59, 59, 999);
      matchRange.$lte = e;
    }

    // Nếu có filter theo createdAt thì dùng lookup pipeline, nếu không để null (tức lấy tất cả)
    const lookupPipeline: any[] = [];
    if (Object.keys(matchRange).length) {
      lookupPipeline.push({ $match: { $expr: { $and: [{ $eq: ["$category", "$$catId"] }, { $gte: ["$createdAt", matchRange.$gte || new Date(0)] }, { $lte: ["$createdAt", matchRange.$lte || new Date()] }] } } });
    } else {
      lookupPipeline.push({ $match: { $expr: { $eq: ["$category", "$$catId"] } } });
    }

    // aggregate trên Category để đảm bảo trả cả danh mục có count = 0
    const agg = await Category.aggregate([
      {
        $lookup: {
          from: "posts",
          let: { catId: "$_id" },
          pipeline: lookupPipeline,
          as: "posts",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          count: { $size: "$posts" },
        },
      },
      { $sort: { name: 1 } },
    ]);

    return agg.map((r: any) => ({ categoryId: r._id, name: r.name, count: r.count }));
  },

  /**
    * Trả về tổng doanh thu, số giao dịch, số người mua, và breakdown theo gói (có tên gói và priority_level để tham khảo)
   */
  async getRevenueFromSubscriptions(params: { year: number; month?: number }) {
    const { year, month } = params;
    if (!Number.isInteger(year) || year < 2000 || year > 3000) throw new Error("Invalid year");
    if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error("Invalid month");

    const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
    const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

    const match: any = {
      status: "paid",
      createdAt: { $gte: start, $lt: end },
    };

    const breakdownByPackage = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$package",
          revenue: { $sum: "$amount" },
          transactions: { $sum: 1 },
          uniqueBuyers: { $addToSet: "$user" },
        },
      },
      {
        $lookup: {
          from: "packages",
          localField: "_id",
          foreignField: "_id",
          as: "package",
        },
      },
      { $unwind: { path: "$package", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          packageId: "$_id",
          packageName: "$package.name",
          priority_level: "$package.priority_level",
          revenue: 1,
          transactions: 1,
          buyers: { $size: "$uniqueBuyers" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const totalsAgg = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$amount" },
          transactions: { $sum: 1 },
          uniqueBuyers: { $addToSet: "$user" },
        },
      },
      {
        $project: {
          _id: 0,
          revenue: 1,
          transactions: 1,
          buyers: { $size: "$uniqueBuyers" },
        },
      },
    ]);

    return {
      filter: { year, ...(month ? { month } : {}) },
      period: { start, end: new Date(end.getTime() - 1) },
      totals: totalsAgg[0] || { revenue: 0, transactions: 0, buyers: 0 },
      byPackage: breakdownByPackage,
    };
  },
};