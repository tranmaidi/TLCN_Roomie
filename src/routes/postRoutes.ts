import express from "express";
import { uploadAny } from "../config/cloudinary";
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";
import * as postController from "../controllers/postController";

const router = express.Router();

// Tạo bài viết (có thể upload nhiều ảnh/video)
router.post("/", authMiddleware, uploadAny.array("media", 10), postController.createPost);

// Tìm kiếm & lọc bài viết (public - middleware sẽ attach user nếu token có)
router.get("/search", optionalAuthMiddleware, postController.searchPosts);

// Tìm kiếm theo bán kính (user gửi lat, lng, maxDistance)
router.get("/nearby", optionalAuthMiddleware, postController.getNearbyPosts);

// Lấy các bài viết được ưu tiên theo gói (priority_level + priority_expiry)
router.get("/priority", optionalAuthMiddleware, postController.getPriority);

// Lấy các bài viết mới nhất
router.get("/newest", optionalAuthMiddleware, postController.getNewest);

// Lấy tất cả bài viết cá nhân hóa (public - middleware will attach user if token present)
router.get("/approved", optionalAuthMiddleware, postController.getApprovedPosts);

// Thay đổi trạng thái bài viết (chuyển sang đã bán hoặc có sẵn)
router.put("/available/:id", authMiddleware, postController.toggleAvailable);

// Xóa bài viết (chủ sở hữu hoặc admin)
router.delete("/:id", authMiddleware, postController.deletePost);

// Lấy tất cả bài viết của chính mình
router.get("/me/all", authMiddleware, postController.getMyPosts);

// Lấy bài viết đã bán của chính mình (available=false)
router.get("/me/sold", authMiddleware, postController.getMySoldPosts);

// Lấy tất cả bài viết (admin)
router.get("/admin/all", authMiddleware, requireAdmin, postController.getAllPostsAdmin);

// Duyệt bài viết (Admin)
//router.put("/approve/:id", authMiddleware, requireAdmin, postController.approvePost);

// Lấy tất cả bài viết đã duyệt của một người dùng
router.get("/approved/user/:userId", postController.getApprovedPostsByUser);

// Lấy bài viết đã bán của một người dùng (public)
router.get("/sold/user/:userId", postController.getSoldPostsByUser);

// Xem chi tiết bài viết
router.get("/:id", postController.getPostDetail);

// Cập nhật bài viết (chủ sở hữu hoặc admin)  
router.put("/:id", authMiddleware, uploadAny.array("media", 10), postController.updatePost);

export default router;
