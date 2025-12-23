import express from "express";
import * as userController from "../controllers/userController";
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";
import { uploadImageOnly } from "../config/cloudinary";

const router = express.Router();

router.post("/register", userController.register);
router.post("/verify-register", userController.verifyRegister);
router.post("/login", userController.login);
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password", userController.resetPassword);

// ROUTE CHỈ DÀNH CHO ADMIN
router.get("/users", authMiddleware, requireAdmin, userController.getAllUsers);
router.post("/admin/users", authMiddleware, requireAdmin, userController.adminCreateUser); // tạo user bởi admin
router.put("/admin/users/:id", authMiddleware, requireAdmin, userController.adminUpdateUser); // sửa toàn bộ user bởi admin
router.delete("/users/:id", authMiddleware, requireAdmin, userController.deleteUser);

// ROUTE DÀNH CHO USER ĐÃ XÁC THỰC HOẶC ADMIN
router.get("/profile", authMiddleware, userController.getProfile);
router.get("/profile/public/:id", userController.getPublicProfile);
router.put("/profile", authMiddleware, userController.updateProfile);
router.put("/profile/avatar", authMiddleware, uploadImageOnly.single("avatar"), userController.updateAvatar);
 
export default router;
