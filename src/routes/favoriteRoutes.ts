import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import * as favoriteController from "../controllers/favoriteController";

const router = Router();

// Lấy danh sách yêu thích
router.get("/", authMiddleware, favoriteController.getFavorites);

// Thêm bài viết vào yêu thích
router.post("/:postId", authMiddleware, favoriteController.addFavorite);

// Xóa bài viết khỏi yêu thích
router.delete("/:postId", authMiddleware, favoriteController.removeFavorite);

export default router;
