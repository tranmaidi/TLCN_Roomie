import { Router } from "express";
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";
import { ReportController } from "../controllers/reportController";

const router = Router();

// User report post
router.post("/", authMiddleware, ReportController.create);

// Admin view reports
router.get("/admin/all", authMiddleware, requireAdmin, ReportController.adminGetAll);

export default router;
