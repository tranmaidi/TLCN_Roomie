import mongoose from "mongoose";
import Conversation from "../models/Conversation";
import Message from "../models/Message";
import UserReview from "../models/UserReview";

type Eligibility = {
  eligible: boolean;
  reason?: string;
  conversationId?: string;
  totals?: { totalMessages: number; myMessages: number; theirMessages: number };
};

function assertObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error(`${name} không hợp lệ`);
}

async function getEligibility(reviewerId: string, revieweeId: string): Promise<Eligibility> {
  assertObjectId(reviewerId, "reviewerId");
  assertObjectId(revieweeId, "revieweeId");
  if (reviewerId === revieweeId) return { eligible: false, reason: "Không thể tự đánh giá chính mình" };

  const conversation = await Conversation.findOne({ members: { $all: [reviewerId, revieweeId] } });
  if (!conversation) return { eligible: false, reason: "Hai người chưa có cuộc trò chuyện" };

  const conversationId = (conversation as any)._id.toString();

  const [totalMessages, myMessages, theirMessages] = await Promise.all([
    Message.countDocuments({ conversation: conversation._id }),
    Message.countDocuments({ conversation: conversation._id, sender: new mongoose.Types.ObjectId(reviewerId) }),
    Message.countDocuments({ conversation: conversation._id, sender: new mongoose.Types.ObjectId(revieweeId) }),
  ]);

  if (totalMessages < 6) {
    return {
      eligible: false,
      reason: "Cuộc trò chuyện phải có tối thiểu 6 tin nhắn",
      conversationId,
      totals: { totalMessages, myMessages, theirMessages },
    };
  }

  if (myMessages < 2 || theirMessages < 2) {
    return {
      eligible: false,
      reason: "Mỗi bên phải nhắn tối thiểu 2 tin nhắn",
      conversationId,
      totals: { totalMessages, myMessages, theirMessages },
    };
  }

  return {
    eligible: true,
    conversationId,
    totals: { totalMessages, myMessages, theirMessages },
  };
}

export const ReviewService = {
  async checkEligibility(reviewerId: string, revieweeId: string) {
    return getEligibility(reviewerId, revieweeId);
  },

  /**
   * Create or update a review (upsert) if constraints are met.
   */
  async upsertReview(params: { reviewerId: string; revieweeId: string; rating: number; text?: string }) {
    const { reviewerId, revieweeId, rating } = params;
    const text = (params.text || "").trim();

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new Error("rating phải từ 1 đến 5");
    if (text.length > 500) throw new Error("text tối đa 500 ký tự");

    const eligibility = await getEligibility(reviewerId, revieweeId);
    if (!eligibility.eligible) {
      const err: any = new Error(eligibility.reason || "Không đủ điều kiện đánh giá");
      err.details = eligibility;
      throw err;
    }

    const conversationId = eligibility.conversationId as string;

    const doc = await UserReview.findOneAndUpdate(
      { reviewer: reviewerId, reviewee: revieweeId },
      {
        $set: {
          conversation: conversationId,
          rating,
          text,
        },
      },
      { new: true, upsert: true }
    )
      .populate("reviewer", "name avatar")
      .populate("reviewee", "name avatar");

    return { review: doc, eligibility };
  },

  async getReviewsAboutUser(userId: string, page = 1, limit = 10) {
    assertObjectId(userId, "userId");
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      UserReview.find({ reviewee: userId })
        .populate("reviewer", "name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      UserReview.countDocuments({ reviewee: userId }),
    ]);

    return {
      content: rows,
      pagination: { total, page, totalPages: Math.ceil(total / limit) },
    };
  },

  async getUserRatingSummary(userId: string) {
    assertObjectId(userId, "userId");

    const agg = await UserReview.aggregate([
      { $match: { reviewee: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$reviewee",
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          count: 1,
          avgRating: { $round: ["$avgRating", 2] },
        },
      },
    ]);

    return agg[0] || { userId, count: 0, avgRating: 0 };
  },

  async getMyGivenReviews(myUserId: string, page = 1, limit = 10) {
    assertObjectId(myUserId, "userId");
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      UserReview.find({ reviewer: myUserId })
        .populate("reviewee", "name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      UserReview.countDocuments({ reviewer: myUserId }),
    ]);

    return {
      content: rows,
      pagination: { total, page, totalPages: Math.ceil(total / limit) },
    };
  },
};
