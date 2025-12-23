import { Request, Response } from "express";
import * as categoryService from "../services/categoryService";

// Thêm danh mục
export const createCategory = async (req: Request, res: Response) => {
  try {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ message: "Thêm danh mục thành công", category });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Lấy tất cả danh mục
export const getAllCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.getAllCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy chi tiết 1 danh mục theo id
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const category = await categoryService.getCategoryById(id);
    if (!category) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    res.json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Cập nhật danh mục
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    res.json({ message: "Cập nhật danh mục thành công", category });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Xóa danh mục
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    await categoryService.deleteCategory(req.params.id);
    res.json({ message: "Xóa danh mục thành công" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
