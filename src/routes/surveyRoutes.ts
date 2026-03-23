import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { getStatus, submitSurvey, getMySurvey, getTemplate } from "../controllers/surveyController";

const router = Router();

// public (yêu cầu đăng nhập) lấy template mới nhất
router.get("/template", authMiddleware, getTemplate);

router.post("/submit", authMiddleware, submitSurvey);
router.get("/status", authMiddleware, getStatus);
router.get("/me", authMiddleware, getMySurvey);

export default router;