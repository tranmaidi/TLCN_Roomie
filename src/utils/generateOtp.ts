import crypto from "crypto";

export function generateOtp(length = 6): string {
  // Tạo mã OTP ngẫu nhiên với số chữ số tùy chọn
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max).toString();
}
