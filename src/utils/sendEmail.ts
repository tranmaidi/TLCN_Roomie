import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";

const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@example.com";
const TIMEOUT_MS = 10_000;

let useSendGrid = false;
if (SENDGRID_KEY) {
  sgMail.setApiKey(SENDGRID_KEY);
  useSendGrid = true;
  console.log("[sendEmail] Using SendGrid for outgoing mail");
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
if (!useSendGrid) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  transporter
    .verify()
    .then(() => console.log("[sendEmail] SMTP transporter ready"))
    .catch((err) => console.warn("[sendEmail] transporter verify failed:", err && err.message));
}

async function sendViaSendGrid(to: string, subject: string, html: string) {
  const msg = {
    to,
    from: FROM,
    subject,
    html,
  };
  // race with timeout to avoid long hangs
  const sendPromise = sgMail.send(msg);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SendGrid send timeout")), TIMEOUT_MS)
  );
  await Promise.race([sendPromise, timeout]);
}

async function sendViaSmtp(to: string, subject: string, html: string) {
  if (!transporter) throw new Error("SMTP transporter not configured");
  const mailOptions = {
    from: `"Tìm Phòng Trọ" <${FROM}>`,
    to,
    subject,
    html,
  };
  const sendPromise = transporter.sendMail(mailOptions);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SMTP send timeout")), TIMEOUT_MS)
  );
  await Promise.race([sendPromise, timeout]);
}

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

  try {
    if (useSendGrid) {
      await sendViaSendGrid(to, subject, html);
    } else {
      await sendViaSmtp(to, subject, html);
    }
    console.log(`[sendEmail] Sent OTP to ${to} (${purpose})`);
  } catch (err: any) {
    console.error("[sendEmail] Failed to send mail:", err && err.message);
    // Không throw — caller không nên bị block vì mail
  }
};
