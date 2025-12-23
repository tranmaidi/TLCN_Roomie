import { Router } from "express";
import {
  createCategory,
  getAllCategories,
  updateCategory,
  getCategoryById,
  deleteCategory,
} from "../controllers/categoryController";
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// ✅ Lấy tất cả danh mục (mọi người đều xem được)
router.get("/", getAllCategories);

// ✅ Chỉ admin mới có quyền thêm, sửa, xóa
router.post("/", authMiddleware, requireAdmin, createCategory);
router.get("/:id", authMiddleware, requireAdmin, getCategoryById);
router.put("/:id", authMiddleware, requireAdmin, updateCategory);
router.delete("/:id", authMiddleware, requireAdmin, deleteCategory);

export default router;
