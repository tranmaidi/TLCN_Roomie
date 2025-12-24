import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // thêm timeout để tránh treo lâu
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
});

// verify transporter khi khởi động (log helpful trên Render)
transporter.verify()
  .then(() => console.log("[sendEmail] SMTP transporter ready"))
  .catch((err) => console.warn("[sendEmail] transporter verify failed:", err && err.message));

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
      ? `<p>Mã OTP của bạn: <b>${otp}</b></p>`
      : `<p>Mã OTP khôi phục: <b>${otp}</b></p>`;

  const mailOptions = {
    from: `"Tìm Phòng Trọ" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    // race giữa sendMail và timeout để tránh treo lâu
    const sendPromise = transporter.sendMail(mailOptions);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP send timeout")), 10_000)
    );
    await Promise.race([sendPromise, timeout]);
    console.log(`[sendEmail] Sent OTP to ${to} (${purpose})`);
  } catch (err: any) {
    console.error("[sendEmail] Failed to send mail:", err && err.message);
    // Không throw tiếp — caller không nên bị block vì mail
  }
};
