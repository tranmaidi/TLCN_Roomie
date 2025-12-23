import Category, { ICategory } from "../models/Category";

export const createCategory = async (data: Partial<ICategory>) => {
  const existing = await Category.findOne({ name: data.name });
  if (existing) throw new Error("Tên danh mục đã tồn tại");
  const category = new Category(data);
  return await category.save();
};

export const getAllCategories = async () => {
  return await Category.find().sort({ createdAt: -1 });
};

export const getCategoryById = async (id: string) => {
  return await Category.findById(id);
};

export const updateCategory = async (id: string, data: Partial<ICategory>) => {
  const category = await Category.findByIdAndUpdate(id, data, { new: true });
  if (!category) throw new Error("Không tìm thấy danh mục");
  return category;
};

export const deleteCategory = async (id: string) => {
  const category = await Category.findByIdAndDelete(id);
  if (!category) throw new Error("Không tìm thấy danh mục để xóa");
  return category;
};
