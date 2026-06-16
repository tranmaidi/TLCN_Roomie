import bcrypt from "bcryptjs";
import User, { IUser } from "../models/User";
import OtpToken from "../models/OtpToken";
import { sendOTPEmail } from "../utils/sendEmail";
import { generateToken } from "../utils/generateToken";
import { generateOtp } from "../utils/generateOtp";
import { NotificationService } from "./notificationService";
import SurveyTemplate from "../models/SurveyTemplate";
import Post from "../models/Post";

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
  const user = await User.findOne({ email, isDeleted: false });
  if (!user) throw new Error("Email chưa đăng ký!");

  if (user.isLocked) throw new Error("Tài khoản đã bị khóa!");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Sai mật khẩu!");

  const token = generateToken(user);

  // kiểm tra có template active không
  const hasTemplate = await SurveyTemplate.exists({ isActive: true });

  // tính flag surveyPending (true nếu user chưa từng login trước đó và có template)
  const surveyPending = !!(!user.hasLoggedIn && hasTemplate);

  // đánh dấu đã login (chỉ lưu nếu trước đó chưa)
  if (!user.hasLoggedIn) {
    // non-blocking là OK nhưng cập nhật đồng bộ an toàn hơn ở đây
    await User.findByIdAndUpdate(user._id, { hasLoggedIn: true }).exec();
    // cập nhật object trả về để frontend nhận đúng trạng thái
    (user as any).hasLoggedIn = true;
  }

  return { token, user, surveyPending };
}

// Quên mật khẩu - gửi OTP
export async function forgotPassword(email: string) {
  const user = await User.findOne({ email, isDeleted: false });
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
  const updated = await User.findOneAndUpdate(
    { email, isDeleted: false },
    { password: hashed }
  );
  if (!updated) throw new Error("Không tìm thấy người dùng");

  await OtpToken.deleteMany({ email, purpose: "forgot" });
  return { message: "Đổi mật khẩu thành công!" };
}

// lấy thông tin cá nhân
export const getProfile = async (userId: string) => {
  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  }).select("-password");

  if (!user) {
    throw new Error("Không tìm thấy người dùng");
  }

  return user;
};

// lấy thông tin người dùng khác (public profile)
export const getPublicProfile = async (targetUserId: string) => {
  const user = await User.findOne({
    _id: targetUserId,
    isDeleted: false,
  }).select(
    "name avatar introduce gender address phone createdAt lastActiveAt"
  );

  if (!user) {
    throw new Error("Không tìm thấy người dùng");
  }

  return user;
};

// cập nhật thông tin cá nhân
export const updateProfile = async (
  userId: string,
  data: Partial<Pick<IUser, "name" | "phone" | "gender" | "address" | "introduce">>
) => {
  const user = await User.findOneAndUpdate({ _id: userId, isDeleted: false }, data, {
    new: true,
    runValidators: true,
  }).select("-password");
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
};

// cập nhật avatar
export const updateAvatar = async (userId: string, imageUrl: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { avatar: imageUrl },
    { new: true }
  ).select("-password");

  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
};

// lấy danh sách người dùng (admin)
export const getAllUsers = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const filter: any = { isDeleted: false };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter)
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
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) {
    const existed = await User.findById(id);
    if (!existed) throw new Error("Không tìm thấy người dùng");
    throw new Error("Người dùng đã bị xóa");
  }

  user.isDeleted = true;
  await user.save();

  await Post.updateMany(
    { owner: user._id, isDeleted: false },
    { $set: { isDeleted: true } }
  );

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

  const current = await User.findOne({ _id: id, isDeleted: false });
  if (!current) {
    const existed = await User.findById(id);
    if (!existed) throw new Error("Không tìm thấy người dùng");
    throw new Error("Người dùng đã bị xóa");
  }

  if (data.email) {
    // đảm bảo email không trùng với user khác
    const other = await User.findOne({ email: data.email, _id: { $ne: id } });
    if (other) throw new Error("Email đã được sử dụng bởi người dùng khác");
  }

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  const user = await User.findOneAndUpdate(
    { _id: id, isDeleted: false },
    updateData,
    { new: true, runValidators: true }
  ).select("-password");
  if (!user) throw new Error("Không tìm thấy người dùng");
  return user;
}

