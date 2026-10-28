
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function verifyEmailTransport() {
  await transporter.verify();
}

export async function sendRegistrationOtp({
  email,
  firstName,
  otp,
}) {
  const expiryMinutes = env.OTP_TTL_MINUTES;

  return transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Verify your email | VeriCore AI",
    text: [
      `Hello ${firstName},`,
      "",
      "Welcome to VeriCore AI.",
      `Your email verification code is: ${otp}`,
      "",
      `This code expires in ${expiryMinutes} minutes.`,
      "Do not share this code with anyone.",
      "",
      "If you did not request this registration, you can ignore this email.",
      "",
      "VeriCore AI",
      "Context-Aware Corporate Knowledge Brain",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
        <h2>Welcome to VeriCore AI</h2>
        <p>Hello ${escapeHtml(firstName)},</p>
        <p>Use this code to verify your email address:</p>
        <p style="font-size:30px;font-weight:bold;letter-spacing:8px">
          ${otp}
        </p>
        <p>This code expires in ${expiryMinutes} minutes.</p>
        <p>Never share this code with anyone.</p>
        <hr />
        <p>VeriCore AI · Context-Aware Corporate Knowledge Brain</p>
      </div>
    `,
  });
}


export async function sendWelcomeEmail({
  email,
  firstName,
  userId,
}) {
  return transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Welcome to VeriCore AI | Your User ID",
    text: [
      `Hello ${firstName},`,
      "",
      "Thank you for verifying your email and joining VeriCore AI.",
      `Your User ID is: ${userId}`,
      "",
      "You can log in using this ID or your verified email address.",
      "Keep your password private.",
      "",
      "Welcome aboard,",
      "The VeriCore AI Team",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
        <h2>Welcome to VeriCore AI</h2>
        <p>Hello ${escapeHtml(firstName)},</p>
        <p>Your email has been verified successfully.</p>
        <p>Your User ID:</p>
        <p style="font-size:24px;font-weight:bold">${escapeHtml(userId)}</p>
        <p>You can use this ID or your verified email address to log in.</p>
        <p>Thank you for joining VeriCore AI.</p>
      </div>
    `,
  });
}




export async function sendSecurityOtp({
  email,
  firstName,
  otp,
  purpose,
}) {
  const messages = {
    password_reset: {
      subject: "Password reset verification | VeriCore AI",
      heading: "Reset your password",
      action: "Use this code to reset your VeriCore AI password.",
    },
    account_deletion: {
      subject: "Confirm account deletion | VeriCore AI",
      heading: "Confirm account deletion",
      action:
        "Use this code to confirm your account deletion request.",
    },
    email_recovery: {
      subject: "Email recovery verification | VeriCore AI",
      heading: "Verify your identity",
      action:
        "Use this code to continue your email recovery request.",
    },
  };

  const message = messages[purpose];

  if (!message) {
    throw new Error("Unsupported security email purpose.");
  }

  return transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: message.subject,
    text: [
      `Hello ${firstName || "there"},`,
      "",
      message.action,
      `Your verification code is: ${otp}`,
      `The code expires in ${env.OTP_TTL_MINUTES} minutes.`,
      "",
      "If you did not request this action, secure your account and contact support.",
      "",
      "VeriCore AI Security Team",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
        <h2>${escapeHtml(message.heading)}</h2>
        <p>Hello ${escapeHtml(firstName || "there")},</p>
        <p>${escapeHtml(message.action)}</p>
        <p style="font-size:30px;font-weight:bold;letter-spacing:8px">
          ${escapeHtml(otp)}
        </p>
        <p>This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>
        <p>If you did not request this action, do not share the code.</p>
        <hr />
        <p>VeriCore AI Security Team</p>
      </div>
    `,
  });
}

export async function sendRecoveryNotice({
  email,
  firstName,
  subject,
  message,
}) {
  return transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject,
    text: `Hello ${firstName || "there"},\n\n${message}\n\nVeriCore AI Security Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
        <h2>${escapeHtml(subject)}</h2>
        <p>Hello ${escapeHtml(firstName || "there")},</p>
        <p>${escapeHtml(message)}</p>
        <p>VeriCore AI Security Team</p>
      </div>
    `,
  });
}


function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}
