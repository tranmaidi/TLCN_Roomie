import multer, { FileFilterCallback } from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { Request } from "express";

// ====== 1️⃣ Cấu hình Cloudinary ======
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

// ====== 2️⃣ Hàm chuẩn hóa tên file ======
const sanitizeBaseName = (filename: string): string => {
  const base = path
    .parse(filename)
    .name.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "file";
};

// ====== 3️⃣ Xác định loại tài nguyên ======
const getResourceType = (mimetype: string): "image" | "video" | "raw" | "auto" => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (
    mimetype === "application/pdf" ||
    mimetype === "application/msword" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "raw";
  return "auto";
};

// ====== 4️⃣ Storage đa năng (ảnh, video, pdf, docx, v.v.) ======
const storageAny = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => {
    const ext = path.extname(file.originalname).replace(".", "").toLowerCase();
    const folder = file.mimetype.startsWith("image/")
      ? "uploads/images"
      : file.mimetype.startsWith("video/")
      ? "uploads/videos"
      : "uploads/files";

    const publicId = sanitizeBaseName(file.originalname);

    return {
      folder,
      public_id: publicId,
      resource_type: getResourceType(file.mimetype),
      use_filename: true,
      unique_filename: false,
      access_mode: "public",
      invalidate: true,
      type: "upload",
      ...(ext ? { format: ext } : {}),
    } as any;
  },
});

// ====== 5️⃣ Storage riêng cho avatar (chỉ ảnh) ======
const storageImageOnly = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => ({
    folder: "uploads/avatars",
    public_id: sanitizeBaseName(file.originalname),
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    use_filename: true,
    unique_filename: false,
    access_mode: "public",
    invalidate: true,
    type: "upload",
  }),
});

// ====== 6️⃣ Bộ lọc file ======
const fileFilterAny = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ok =
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!ok) {
    const err: any = new Error("Chỉ chấp nhận ảnh, video, hoặc file PDF/DOC/DOCX");
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

const fileFilterImageOnly = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (!file.mimetype.startsWith("image/")) {
    const err: any = new Error("Chỉ chấp nhận ảnh (jpg, jpeg, png, webp).");
    err.code = "INVALID_IMAGE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

// ====== 7️⃣ Tạo middleware upload ======
const uploadAny = multer({
  storage: storageAny,
  fileFilter: fileFilterAny,
  limits: { fileSize: 50 * 1024 * 1024 }, // Tối đa 50MB / file
});

const uploadImageOnly = multer({
  storage: storageImageOnly,
  fileFilter: fileFilterImageOnly,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cho ảnh
});

// ====== 8️⃣ Xuất module ======
export { cloudinary, uploadAny, uploadImageOnly };
