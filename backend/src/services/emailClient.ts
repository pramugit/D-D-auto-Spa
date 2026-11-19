import nodemailer, { type Transporter } from "nodemailer";

// Outgoing email (Gmail or any SMTP). Configure via env vars:
//   SMTP_USER  - the sending address, e.g. yourshop@gmail.com
//   SMTP_PASS  - for Gmail: an App Password (Google Account → Security →
//                2-Step Verification → App passwords), NOT the normal password
//   SMTP_HOST  - default smtp.gmail.com
//   SMTP_PORT  - default 465 (SSL)
//   SMTP_FROM  - optional display sender, default "D & D Auto Spa <SMTP_USER>"
//
// Without SMTP_USER + SMTP_PASS every send is logged to the console instead,
// so local development works with no mail account.

let transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailConfigured()) {
    console.log(`[email stub] to ${to} — ${subject}\n${text}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || `D & D Auto Spa <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}
