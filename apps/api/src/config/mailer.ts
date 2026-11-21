
import nodemailer from "nodemailer";

import { env } from "./env.js";

// --------------------------------------------------
// SMTP transporter
// --------------------------------------------------

export const mailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,

  // Gmail port 587 uses STARTTLS.
  secure: env.SMTP_SECURE,
  requireTLS: !env.SMTP_SECURE,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },

  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,

  // Avoid logging SMTP traffic or credentials.
  logger: false,
  debug: false,
});

// --------------------------------------------------
// Verify SMTP connection
// --------------------------------------------------

export async function verifyMailerConnection(): Promise<void> {
  try {
    await mailTransporter.verify();

    console.info("SMTP connection verified successfully.");
  } catch {
    console.error(
      "SMTP connection verification failed.",
    );

    throw new Error(
      "Unable to establish the email service connection.",
    );
  }
}

// --------------------------------------------------
// Reusable email sender
// --------------------------------------------------

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  options: SendEmailOptions,
): Promise<void> {
  try {
    await mailTransporter.sendMail({
      from: {
        name: env.MAIL_FROM_NAME,
        address: env.MAIL_FROM_EMAIL,
      },

      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  } catch {
    console.error("Email delivery failed.");

    throw new Error(
      "Unable to send the email. Please try again later.",
    );
  }
}
