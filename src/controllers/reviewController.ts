import { Request, Response } from "express";
import { ReviewService } from "../services/reviewService";

export class ReviewController {
  // GET /api/reviews/eligibility/:userId
  static async eligibility(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const reviewerId = req.user?.id;
      const revieweeId = req.params.userId;
      if (!reviewerId) return res.status(401).json({ message: "Unauthorized" });

      const data = await ReviewService.checkEligibility(reviewerId, revieweeId);
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message, details: err.details });
    }
  }

  // POST /api/reviews
  static async upsert(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const reviewerId = req.user?.id;
      const { revieweeId, rating, text } = req.body;

      if (!reviewerId) return res.status(401).json({ message: "Unauthorized" });
      if (!revieweeId) return res.status(400).json({ message: "revieweeId required" });

      const out = await ReviewService.upsertReview({
        reviewerId,
        revieweeId,
        rating: Number(rating),
        text,
      });

      return res.status(201).json({ success: true, ...out });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message, details: err.details });
    }
  }

  // GET /api/reviews/about/:userId?page=&limit=
  static async getAboutUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const [list, summary] = await Promise.all([
        ReviewService.getReviewsAboutUser(userId, page, limit),
        ReviewService.getUserRatingSummary(userId),
      ]);
      return res.json({ success: true, ...list, summary });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /api/reviews/me?page=&limit=
  static async myGiven(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const myUserId = req.user?.id;
      if (!myUserId) return res.status(401).json({ message: "Unauthorized" });

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const data = await ReviewService.getMyGivenReviews(myUserId, page, limit);
      return res.json({ success: true, ...data });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /api/reviews/me/about?page=&limit=
  static async myAbout(req: Request & { user?: { id: string } }, res: Response) {
    try {
      const myUserId = req.user?.id;
      if (!myUserId) return res.status(401).json({ message: "Unauthorized" });

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const [list, summary] = await Promise.all([
        ReviewService.getReviewsAboutUser(myUserId, page, limit),
        ReviewService.getUserRatingSummary(myUserId),
      ]);
      return res.json({ success: true, ...list, summary });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
