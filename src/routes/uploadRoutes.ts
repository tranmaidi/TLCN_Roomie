import express from "express";
import { uploadAny } from "../config/cloudinary";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

// Upload 1 file hoặc nhiều ảnh (mỗi lần max 5 file)
router.post("/", authMiddleware, uploadAny.array("files", 5), (req, res) => {
  try {
    const uploadedFiles = req.files as Express.Multer.File[];
    // CloudinaryStorage trả URL trong path
    const urls = uploadedFiles.map(f => (f as any).path);
    res.json({ success: true, urls });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
