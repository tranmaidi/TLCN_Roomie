import { Router } from "express";
import { AdminController } from "../controllers/adminController";
// dùng middleware đã có
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";
import { SurveyTemplateController } from "../controllers/surveyTemplateController";

const router = Router();

// bắt buộc xác thực và quyền admin
router.use(authMiddleware);
router.use(requireAdmin);

router.get("/stats", AdminController.stats);
router.get("/posts-by-category", AdminController.postsByCategory);

// Survey template management (admin)
router.get("/surveys/templates", SurveyTemplateController.list);
router.post("/surveys/templates", SurveyTemplateController.create);
router.get("/surveys/templates/:id", SurveyTemplateController.get);
router.put("/surveys/templates/:id", SurveyTemplateController.update);
router.delete("/surveys/templates/:id", SurveyTemplateController.remove);

export default router;