import bcrypt from "bcryptjs";
import User, { IUser } from "../models/User";
import OtpToken from "../models/OtpToken";
import { sendOTPEmail } from "../utils/sendEmail";
import { generateToken } from "../utils/generateToken";
import { generateOtp } from "../utils/generateOtp";
import { NotificationService } from "./notificationService";

const OTP_EXPIRE_MINUTES = 5;

// Gửi OTP đăng ký
export async function registerRequest(
  name: string,
  email: string,
  password: string,
  phone: string
) {
  const existing = await User.findOne({ email });
  if (existing) throw new Error("Email đã tồn tại!");

  const hashed = await bcrypt.hash(password, 10);
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);

  await OtpToken.create({
    email,
    code: otp,
    purpose: "register",
    password: hashed,
    role: "user",
    name,
    phone,
    expiresAt,
  });

  // fire-and-forget: không await để request trả về nhanh nếu SMTP chậm/blocked
  sendOTPEmail(email, otp, "register").catch((e) =>
    console.error("[userService] sendOTPEmail error (non-blocking):", e && e.message)
  );

  return { message: "Đã gửi mã OTP tới email để xác thực." };
}

// Xác thực OTP và hoàn tất đăng ký
export async function verifyRegister(email: string, code: string) {
  const record = await OtpToken.findOne({ email, code, purpose: "register" });
  if (!record) throw new Error("Mã OTP không hợp lệ!");
  if (record.expiresAt < new Date()) throw new Error("Mã OTP đã hết hạn!");

  const user = await User.create({
    name: record.name,
    email,
    password: record.password,
    role: record.role || "user",
    isVerified: true,
    phone: record.phone,
  });

  // --- Gửi thông báo chào mừng ---
  await NotificationService.createNotification({
    user: user._id.toString(),
    type: "system",
    content: `Chào mừng ${user.name} đến với hệ thống! 🎉`,
  });

  await OtpToken.deleteMany({ email, purpose: "register" });
  return user;
}

// Đăng nhập (tạo JWT ngay trong hàm)
export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Email chưa đăng ký!");

  // mới: kiểm tra tài khoản bị khóa
  if (user.isLocked) throw new Error("Tài khoản đã bị khóa!");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Sai mật khẩu!");

  // Tạo JWT
  const token = generateToken(user);

  return { token, user };
}

// Quên mật khẩu - gửi OTP
export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Email không tồn tại!");

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);

  await OtpToken.create({
    email,
    code: otp,
    purpose: "forgot",
    expiresAt,
  });

  await sendOTPEmail(email, otp, "forgot");
  return { message: "Đã gửi mã OTP khôi phục tới email của bạn." };
}

// Đặt lại mật khẩu
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
) {
  const record = await OtpToken.findOne({ email, code, purpose: "forgot" });
  if (!record) throw new Error("Mã OTP không hợp lệ hoặc đã hết hạn!");

  const hashed = await bcrypt.hash(newPassword, 10);
  await User.findOneAndUpdate({ email }, { password: hashed });

  await OtpToken.deleteMany({ email, purpose: "forgot" });
  return { message: "Đổi mật khẩu thành công!" };
}

// lấy thông tin cá nhân
export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).select("-password");
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
};

// lấy thông tin người dùng khác (public profile)
export const getPublicProfile = async (targetUserId: string) => {
  const user = await User.findById(targetUserId)
    .select("name avatar introduce gender address phone createdAt lastActiveAt");

  if (!user) throw new Error("Không tìm thấy người dùng");

  return user;
};

// cập nhật thông tin cá nhân
export const updateProfile = async (
  userId: string,
  data: Partial<Pick<IUser, "name" | "phone" | "gender" | "address" | "introduce">>
) => {
  const user = await User.findByIdAndUpdate(userId, data, {
    new: true,
    runValidators: true,
  }).select("-password");
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
};

// cập nhật avatar
export const updateAvatar = async (userId: string, imageUrl: string) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { avatar: imageUrl },
    { new: true }
  ).select("-password");

  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
};

// lấy danh sách người dùng (admin)
export const getAllUsers = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments()
  ]);

  return {
    content: users,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};


// xoá người dùng (admin)
export const deleteUser = async (id: string) => {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new Error("Không tìm thấy người dùng");
  return { message: "Đã xóa người dùng thành công" };
};

// --- Hàm dành cho admin: tạo user không cần OTP ---
export async function createUserByAdmin(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: "guest" | "user" | "admin";
  isVerified?: boolean;
  isLocked?: boolean;
}) {
  const existing = await User.findOne({ email: data.email });
  if (existing) throw new Error("Email đã tồn tại!");

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await User.create({
    name: data.name,
    email: data.email,
    password: hashed,
    phone: data.phone,
    role: data.role || "user",
    isVerified: data.isVerified ?? true, // admin tạo mặc định xác thực
    isLocked: data.isLocked ?? false,
  });

  // có thể gửi thông báo chào mừng
  await NotificationService.createNotification({
    user: user._id.toString(),
    type: "system",
    content: `Tài khoản được tạo bởi quản trị viên: ${user.name}`,
  });

  return user.toObject();
}

// --- Hàm dành cho admin: cập nhật toàn bộ thông tin user (bao gồm khóa/mở khóa) ---
export async function adminUpdateUser(
  id: string,
  data: Partial<Pick<IUser, "name" | "email" | "phone" | "gender" | "address" | "introduce" | "role" | "isVerified" | "isLocked">> & { password?: string }
) {
  const updateData: any = { ...data };

  if (data.email) {
    // đảm bảo email không trùng với user khác
    const other = await User.findOne({ email: data.email, _id: { $ne: id } });
    if (other) throw new Error("Email đã được sử dụng bởi người dùng khác");
  }

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  const user = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).select("-password");
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
}

