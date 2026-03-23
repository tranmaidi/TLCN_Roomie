import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone?: string;
  gender?: "Nam" | "Nữ" | "Khác";
  avatar?: string;
  address?: string;
  role: "guest" | "user" | "admin";
  isVerified: boolean;
  isOnline: boolean;
  lastActiveAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  introduce?: string;

  // mới: trạng thái bị khóa
  isLocked?: boolean;

  // mới: đã từng đăng nhập (dùng để quyết định show survey lần đầu)
  hasLoggedIn?: boolean;

  // methods
  hasRole(role: string): boolean;
  isAdmin(): boolean;
  isGuest(): boolean;
  isUser(): boolean;
}

// Schema định nghĩa trong MongoDB
const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      maxlength: 255,
    },
    phone: {
      type: String,
      maxlength: 15,
      unique: true,
      sparse: true, // cho phép trùng nếu không có giá trị
    },
    gender: {
      type: String,
      enum: ["Nam", "Nữ", "Khác"],
      default: "Khác",
    },
    avatar: {
      type: String,
      maxlength: 900,
      default: "https://res.cloudinary.com/ds1rgnuvr/image/upload/v1733239477/928429_account_customer_profile_user_icon_akxdo2.png",
    },
    address: {
      type: String,
      maxlength: 255,
      default: "",
    },
    role: {
      type: String,
      enum: ["guest", "user", "admin"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastActiveAt: {
      type: Date,
    },
    introduce: {
      type: String,
      maxlength: 900,
      default: "",
    },

    // mới: mặc định không bị khóa
    isLocked: {
      type: Boolean,
      default: false,
    },
    // đánh dấu đã đăng nhập lần đầu hay chưa (mặc định false)
    hasLoggedIn: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index để tối ưu truy vấn
userSchema.index({ role: 1 });

// Virtual (thuộc tính ảo, không lưu trong DB)
userSchema.virtual("shortInfo").get(function (this: IUser) {
  return {
    name: this.name,
    email: this.email,
    role: this.role,
  };
});

// Methods
userSchema.methods.hasRole = function (this: IUser, role: string): boolean {
  return this.role === role;
};

userSchema.methods.isAdmin = function (this: IUser): boolean {
  return this.role === "admin";
};

userSchema.methods.isGuest = function (this: IUser): boolean {
  return this.role === "guest";
};

userSchema.methods.isUser = function (this: IUser): boolean {
  return this.role === "user";
};

// Xuất model
const User = mongoose.model<IUser>("User", userSchema);
export default User;
