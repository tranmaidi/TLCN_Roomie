import Category, { ICategory } from "../models/Category";
import mongoose from "mongoose";

export const createCategory = async (data: Partial<ICategory>) => {
  const existing = await Category.findOne({ name: data.name });
  if (existing) throw new Error("Tên danh mục đã tồn tại");
  const category = new Category(data);
  return await category.save();
};

export const getAllCategories = async () => {
  return await Category.find({ isDeleted: false }).sort({ createdAt: -1 });
};

export const getCategoryById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("ID danh mục không hợp lệ");
  }

  return await Category.findOne({ _id: id, isDeleted: false });
};

export const updateCategory = async (id: string, data: Partial<ICategory>) => {
  const category = await Category.findOneAndUpdate(
    { _id: id, isDeleted: false },
    data,
    { new: true, runValidators: true }
  );
  if (!category) {
    const existed = await Category.findById(id);
    if (!existed) throw new Error("Không tìm thấy danh mục");
    throw new Error("Danh mục đã bị xóa");
  }
  return category;
};

export const deleteCategory = async (id: string) => {
  const category = await Category.findOne({ _id: id, isDeleted: false });
  if (!category) {
    const existed = await Category.findById(id);
    if (!existed) throw new Error("Không tìm thấy danh mục để xóa");
    throw new Error("Danh mục đã bị xóa");
  }

  category.isDeleted = true;
  await category.save();

  return category;
};
