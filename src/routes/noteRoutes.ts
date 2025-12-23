import { Router } from "express";
import noteController from "../controllers/noteController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Bảo vệ route
router.use(authMiddleware);

router.get("/", noteController.list); // GET /api/notes?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/date/:date", noteController.getByDate); // GET /api/notes/date/2025-12-01
router.post("/", noteController.createItems); // body: { date: 'YYYY-MM-DD', items: [...] }
router.put("/:id", noteController.update); // update items by note id
router.delete("/:id", noteController.remove);

export default router;