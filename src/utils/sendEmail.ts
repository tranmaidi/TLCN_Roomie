import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (
  to: string,
  otp: string,
  purpose: "register" | "forgot"
) => {
  const subject =
    purpose === "register"
      ? "Xác thực tài khoản - Tìm Phòng Trọ"
      : "Quên mật khẩu - Tìm Phòng Trọ";

  const html =
    purpose === "register"
      ? `
        <p>Chào bạn,</p>
        <p>Mã OTP để xác thực tài khoản của bạn là: <b>${otp}</b></p>
        <p>Mã này sẽ hết hạn sau <b>5 phút</b>.</p>
        <br/>
        <p>Trân trọng,<br/>Đội ngũ Tìm Phòng Trọ</p>
      `
      : `
        <p>Chào bạn,</p>
        <p>Mã OTP để đặt lại mật khẩu của bạn là: <b>${otp}</b></p>
        <p>Mã này sẽ hết hạn sau <b>5 phút</b>.</p>
        <br/>
        <p>Trân trọng,<br/>Đội ngũ Tìm Phòng Trọ</p>
      `;

  await transporter.sendMail({
    from: `"Tìm Phòng Trọ" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};
