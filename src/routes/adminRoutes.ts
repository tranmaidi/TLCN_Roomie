import { Router } from "express";
import { AdminController } from "../controllers/adminController";
// dùng middleware đã có
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// bắt buộc xác thực và quyền admin
router.use(authMiddleware);
router.use(requireAdmin);

router.get("/stats", AdminController.stats);
router.get("/posts-by-category", AdminController.postsByCategory);

export default router;