import mongoose, { Document, Schema } from "mongoose";

export interface IOtpToken extends Document {
  email: string;
  code: string;
  purpose: "register" | "forgot" | "reset";
  name?: string;
  password?: string;
  role?: string;
  phone?: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const OtpTokenSchema = new Schema<IOtpToken>(
  {
    email: { type: String, required: true, index: true },
    code: { type: String, required: true },
    purpose: {
      type: String,
      enum: ["register", "forgot", "reset"],
      required: true,
    },
    name: { type: String },
    password: { type: String },
    role: { type: String },
    phone: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index để tự động xoá khi hết hạn
OtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OtpToken = mongoose.model<IOtpToken>("OtpToken", OtpTokenSchema);
export default OtpToken;
