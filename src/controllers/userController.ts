import { Request, Response } from "express";
import * as userService from "../services/userService";

// Gửi OTP để đăng ký
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    const result = await userService.registerRequest(name, email, password, phone);
    return res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    return res.status(400).json({ error: error.message });
  }
};

// Xác minh OTP và hoàn tất đăng ký
export const verifyRegister = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await userService.verifyRegister(email, code);
    return res.status(201).json({ message: "Đăng ký thành công!", user });
  } catch (err) {
    const error = err as Error;
    return res.status(400).json({ error: error.message });
  }
};

// Đăng nhập
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await userService.login(email, password);
    return res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    return res.status(400).json({ error: error.message });
  }
};

// Quên mật khẩu (gửi OTP)
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await userService.forgotPassword(email);
    return res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    return res.status(400).json({ error: error.message });
  }
};

// Đặt lại mật khẩu
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    const result = await userService.resetPassword(email, code, newPassword);
    return res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    return res.status(400).json({ error: error.message });
  }
};

// Thống kê public cho trang giới thiệu
export const getPublicStats = async (_req: Request, res: Response) => {
  try {
    const stats = await userService.getPublicStats();
    return res.status(200).json(stats);
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message });
  }
};

// Lấy thông tin cá nhân
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const profile = await userService.getProfile(userId);
    res.json(profile);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy thông tin public của người khác
export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await userService.getPublicProfile(id);
    return res.json(user);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

// Cập nhật thông tin cá nhân
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, phone, gender, address, introduce } = req.body;
    const updated = await userService.updateProfile(userId, {
      name,
      phone,
      gender,
      address,
      introduce,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// Cập nhật avatar
export const updateAvatar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const file = req.file as Express.Multer.File;

    if (!file) throw new Error("Không có file tải lên");

    const imageUrl = (file as any).path || (file as any).url;

    const updated = await userService.updateAvatar(userId, imageUrl);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách user (Admin)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const users = await userService.getAllUsers(page, limit);
    res.status(200).json(users);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// xóa user (Admin)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await userService.deleteUser(id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

// ADMIN: tạo user không cần OTP
export const adminCreateUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, role, isVerified, isLocked } = req.body;
    const user = await userService.createUserByAdmin({ name, email, password, phone, role, isVerified, isLocked });
    return res.status(201).json(user);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

// ADMIN: cập nhật user (toàn quyền)
export const adminUpdateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await userService.adminUpdateUser(id, data);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
