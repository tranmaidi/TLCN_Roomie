import { Router } from "express";
import { ReviewController } from "../controllers/reviewController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Kiểm tra điều kiện để đánh giá người dùng khác
router.get("/eligibility/:userId", authMiddleware, ReviewController.eligibility);

// Tạo hoặc cập nhật đánh giá
router.post("/", authMiddleware, ReviewController.upsert);

// Xem các đánh giá của người khác
router.get("/about/:userId", ReviewController.getAboutUser);

// Xem các đánh giá của người khác về chính mình
router.get("/me/about", authMiddleware, ReviewController.myAbout);

// Các đánh giá của mình về người khác
router.get("/me", authMiddleware, ReviewController.myGiven);

export default router;
