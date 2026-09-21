import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_APP_PASSWORD
  }
});

export async function sendEmail({
  to,
  subject,
  text,
  html
}) {
  return transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    html
  });
}


export async function sendRegistrationOtp({
  to,
  firstName,
  otp
}) {
  return sendEmail({
    to,
    subject: "VeriCore AI - Email Verification OTP",
    text: `Hello ${firstName},

Your VeriCore AI verification OTP is:

${otp}

This OTP expires in ${env.OTP_EXPIRES_MINUTES} minutes.

If you did not request this registration, please ignore this email.

VeriCore AI`,
    html: `
      <div style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:620px;
        margin:0 auto;
        padding:30px 20px;
        color:#172033;
        background:#ffffff;
      ">

        <!-- Header -->
        <div style="
          text-align:center;
          padding-bottom:24px;
          border-bottom:1px solid #e5e9f0;
        ">

          <img
            src="https://res.cloudinary.com/fdwexjk4/image/upload/v1789891015/output-onlinegiftools.gif"
            alt="VeriCore AI"
            style="
              width:90px;
              height:90px;
              object-fit:contain;
              border-radius:16px;
              display:block;
              margin:0 auto 16px;
            "
          >

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:2px;
            color:#64748b;
            text-transform:uppercase;
          ">
            ◉ ENTERPRISE SOP AGENT
          </div>

          <h2 style="
            margin:10px 0 5px;
            font-size:24px;
            color:#111827;
            letter-spacing:-0.4px;
          ">
            VeriCore AI
          </h2>

          <p style="
            margin:0;
            font-size:13px;
            color:#64748b;
          ">
            Intelligent Enterprise Knowledge System
          </p>
        </div>

        <!-- Greeting -->
        <div style="padding:28px 4px 18px;">

          <p style="
            margin:0 0 8px;
            font-size:16px;
            color:#1f2937;
          ">
            Hello ${firstName},
          </p>

          <p style="
            margin:0;
            font-size:14px;
            line-height:1.7;
            color:#64748b;
          ">
            Your registration request has initiated a secure
            <strong style="color:#334155;">identity verification protocol</strong>.
            Use the verification code below to activate your VeriCore AI account.
          </p>

        </div>

        <!-- Neural Verification Indicator -->
        <div style="
          text-align:center;
          padding:14px 0 8px;
        ">

          <div style="
            font-size:22px;
            letter-spacing:7px;
            color:#64748b;
          ">
            ⬡ ─ ◉ ─ ⬡ ─ ◉ ─ ⬡
          </div>

          <p style="
            margin:9px 0 0;
            font-size:10px;
            font-weight:bold;
            letter-spacing:1.8px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Neural Identity Verification
          </p>

        </div>

        <!-- OTP -->
        <div style="
          margin:20px 0;
          padding:24px 18px;
          text-align:center;
          border:1px solid #dbe2ea;
          border-radius:14px;
          background:#f8fafc;
        ">

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:1.5px;
            color:#64748b;
            text-transform:uppercase;
            margin-bottom:12px;
          ">
            🔐 Verification Protocol
          </div>

          <h1 style="
            margin:0;
            font-size:36px;
            line-height:1;
            letter-spacing:9px;
            color:#111827;
            font-weight:700;
          ">
            ${otp}
          </h1>

          <div style="
            margin-top:15px;
            font-size:12px;
            color:#64748b;
          ">
            One-Time Authentication Code
          </div>

        </div>

        <!-- Security Information -->
        <div style="
          padding:18px 20px;
          border-left:3px solid #64748b;
          margin:22px 0;
        ">

          <p style="
            margin:0 0 9px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            ⏱ Secure Session Window
          </p>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.6;
            color:#64748b;
          ">
            This OTP expires in
            <strong style="color:#334155;">
              ${env.OTP_EXPIRES_MINUTES} minutes
            </strong>.
          </p>

        </div>

        <!-- Security Notice -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:20px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🛡 Security Notice
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            If you did not request this registration, please ignore this email.
            Never share your verification code with another person.
          </p>

        </div>

        <!-- Footer -->
        <div style="
          text-align:center;
          margin-top:28px;
          padding-top:20px;
          border-top:1px solid #e5e9f0;
        ">

          <div style="
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            VeriCore AI
          </div>

          <div style="
            margin-top:6px;
            font-size:10px;
            letter-spacing:1.4px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Enterprise Intelligence • SOP Automation • Secure Access
          </div>

          <div style="
            margin-top:13px;
            font-size:10px;
            color:#cbd5e1;
          ">
            ◉ SYSTEM GENERATED SECURITY COMMUNICATION
          </div>

        </div>

      </div>
    `
  });
}




export async function sendUserIdEmail({
  to,
  firstName,
  userId
}) {
  return sendEmail({
    to,
    subject: "Welcome to VeriCore AI - Your User ID",
    text: `Hello ${firstName},

Thank you for registering with VeriCore AI.

Your User ID is:

${userId}

You can use this User ID or your verified email address to log in.

Welcome to VeriCore AI.`,
    html: `
      <div style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:620px;
        margin:0 auto;
        padding:30px 20px;
        color:#172033;
        background:#ffffff;
      ">

        <!-- Enterprise Header -->
        <div style="
          text-align:center;
          padding-bottom:24px;
          border-bottom:1px solid #e5e9f0;
        ">

          <img
            src="https://res.cloudinary.com/fdwexjk4/image/upload/v1789891015/output-onlinegiftools.gif"
            alt="VeriCore AI"
            style="
              width:90px;
              height:90px;
              object-fit:contain;
              border-radius:16px;
              display:block;
              margin:0 auto 16px;
            "
          >

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:2px;
            color:#64748b;
            text-transform:uppercase;
          ">
            ◉ ENTERPRISE SOP AGENT
          </div>

          <h2 style="
            margin:10px 0 5px;
            font-size:24px;
            color:#111827;
            letter-spacing:-0.4px;
          ">
            VeriCore AI
          </h2>

          <p style="
            margin:0;
            font-size:13px;
            color:#64748b;
          ">
            Intelligent Enterprise Knowledge System
          </p>

        </div>

        <!-- Welcome -->
        <div style="padding:28px 4px 18px;">

          <div style="
            font-size:26px;
            margin-bottom:10px;
          ">
            🧠 ✓
          </div>

          <p style="
            margin:0 0 8px;
            font-size:16px;
            color:#1f2937;
          ">
            Hello ${firstName},
          </p>

          <p style="
            margin:0;
            font-size:14px;
            line-height:1.7;
            color:#64748b;
          ">
            Thank you for registering with
            <strong style="color:#334155;">VeriCore AI</strong>.
            Your enterprise identity has been successfully provisioned.
          </p>

        </div>

        <!-- Neural Network Indicator -->
        <div style="
          text-align:center;
          padding:10px 0 16px;
        ">

          <div style="
            font-size:22px;
            letter-spacing:7px;
            color:#64748b;
          ">
            ◉ ─ ⬡ ─ ◉ ─ ⬡ ─ ◉
          </div>

          <p style="
            margin:9px 0 0;
            font-size:10px;
            font-weight:bold;
            letter-spacing:1.8px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Neural Identity • Access Provisioned
          </p>

        </div>

        <!-- User ID Card -->
        <div style="
          margin:10px 0 24px;
          padding:25px 20px;
          text-align:center;
          border:1px solid #dbe2ea;
          border-radius:14px;
          background:#f8fafc;
        ">

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:1.5px;
            color:#64748b;
            text-transform:uppercase;
            margin-bottom:12px;
          ">
            🆔 Enterprise User Identity
          </div>

          <div style="
            font-size:11px;
            color:#94a3b8;
            margin-bottom:9px;
          ">
            YOUR VERIFIED USER ID
          </div>

          <div style="
            font-size:26px;
            font-weight:700;
            letter-spacing:2px;
            color:#111827;
            word-break:break-word;
          ">
            ${userId}
          </div>

          <div style="
            margin-top:14px;
            font-size:11px;
            color:#64748b;
          ">
            ✓ Identity Provisioned Successfully
          </div>

        </div>

        <!-- Login Access -->
        <div style="
          padding:18px 20px;
          border-left:3px solid #64748b;
          margin:22px 0;
        ">

          <p style="
            margin:0 0 9px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🔐 Secure Login Access
          </p>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.7;
            color:#64748b;
          ">
            You can use this
            <strong style="color:#334155;">User ID</strong>
            or your verified email address to log in to VeriCore AI.
          </p>

        </div>

        <!-- Enterprise Identity Notice -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:20px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🛡 Identity Security
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            Keep your User ID secure. It is associated with your
            VeriCore AI enterprise identity and may be required for
            authenticated access.
          </p>

        </div>

        <!-- Footer -->
        <div style="
          text-align:center;
          margin-top:28px;
          padding-top:20px;
          border-top:1px solid #e5e9f0;
        ">

          <div style="
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            VeriCore AI
          </div>

          <div style="
            margin-top:6px;
            font-size:10px;
            letter-spacing:1.4px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Enterprise Intelligence • SOP Automation • Secure Access
          </div>

          <div style="
            margin-top:13px;
            font-size:10px;
            color:#cbd5e1;
          ">
            ◉ SYSTEM GENERATED ACCOUNT COMMUNICATION
          </div>

        </div>

      </div>
    `
  });
}




export async function sendParentAssuranceEmail({
  to,
  childName
}) {
  return sendEmail({
    to,
    subject: "VeriCore AI - Parent/Guardian Verification Required",
    text: `Hello,

A registration associated with ${childName} requires parent/guardian verification.

Please follow the verification instructions provided by VeriCore AI.

VeriCore AI`,
    html: `
      <div style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:620px;
        margin:0 auto;
        padding:30px 20px;
        color:#172033;
        background:#ffffff;
      ">

        <!-- Enterprise Header -->
        <div style="
          text-align:center;
          padding-bottom:24px;
          border-bottom:1px solid #e5e9f0;
        ">

          <img
            src="https://res.cloudinary.com/fdwexjk4/image/upload/v1789891015/output-onlinegiftools.gif"
            alt="VeriCore AI"
            style="
              width:90px;
              height:90px;
              object-fit:contain;
              border-radius:16px;
              display:block;
              margin:0 auto 16px;
            "
          >

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:2px;
            color:#64748b;
            text-transform:uppercase;
          ">
            ◉ ENTERPRISE SOP AGENT
          </div>

          <h2 style="
            margin:10px 0 5px;
            font-size:24px;
            color:#111827;
            letter-spacing:-0.4px;
          ">
            VeriCore AI
          </h2>

          <p style="
            margin:0;
            font-size:13px;
            color:#64748b;
          ">
            Intelligent Enterprise Knowledge System
          </p>

        </div>

        <!-- Verification Introduction -->
        <div style="padding:28px 4px 18px;">

          <div style="
            font-size:27px;
            margin-bottom:10px;
          ">
            🧠 🛡️
          </div>

          <p style="
            margin:0 0 8px;
            font-size:17px;
            font-weight:bold;
            color:#1f2937;
          ">
            Parent/Guardian Verification Required
          </p>

          <p style="
            margin:0;
            font-size:14px;
            line-height:1.7;
            color:#64748b;
          ">
            A registration associated with
            <strong style="color:#334155;">
              ${childName}
            </strong>
            requires parent/guardian verification.
          </p>

        </div>

        <!-- Neural Verification Indicator -->
        <div style="
          text-align:center;
          padding:10px 0 18px;
        ">

          <div style="
            font-size:22px;
            letter-spacing:7px;
            color:#64748b;
          ">
            ◉ ─ ⬡ ─ ◉ ─ ⬡ ─ ◉
          </div>

          <p style="
            margin:9px 0 0;
            font-size:10px;
            font-weight:bold;
            letter-spacing:1.8px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Identity Review • Guardian Authorization
          </p>

        </div>

        <!-- Verification Status -->
        <div style="
          margin:8px 0 24px;
          padding:25px 20px;
          text-align:center;
          border:1px solid #dbe2ea;
          border-radius:14px;
          background:#f8fafc;
        ">

          <div style="
            font-size:31px;
            margin-bottom:12px;
          ">
            👨‍👩‍👧
          </div>

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:1.5px;
            color:#64748b;
            text-transform:uppercase;
            margin-bottom:10px;
          ">
            Guardian Authorization Protocol
          </div>

          <div style="
            font-size:15px;
            font-weight:bold;
            color:#334155;
          ">
            Verification Action Required
          </div>

          <div style="
            margin-top:10px;
            font-size:12px;
            line-height:1.6;
            color:#64748b;
          ">
            A parent or legal guardian must review and complete
            the verification process.
          </div>

        </div>

        <!-- Registration Information -->
        <div style="
          padding:18px 20px;
          border-left:3px solid #64748b;
          margin:22px 0;
        ">

          <p style="
            margin:0 0 9px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🔎 Registration Review
          </p>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.7;
            color:#64748b;
          ">
            This registration is associated with:
          </p>

          <p style="
            margin:9px 0 0;
            font-size:16px;
            font-weight:bold;
            color:#334155;
          ">
            ${childName}
          </p>

        </div>

        <!-- Instructions -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:20px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            📋 Required Action
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            Please follow the verification instructions provided by
            VeriCore AI to review and complete the parent/guardian
            verification process.
          </p>

        </div>

        <!-- Security / Trust Notice -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:14px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🛡️ Verification &amp; Safety
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            Please review the verification request carefully and
            complete the process using the official VeriCore AI
            verification instructions.
          </p>

        </div>

        <!-- Footer -->
        <div style="
          text-align:center;
          margin-top:28px;
          padding-top:20px;
          border-top:1px solid #e5e9f0;
        ">

          <div style="
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            VeriCore AI
          </div>

          <div style="
            margin-top:6px;
            font-size:10px;
            letter-spacing:1.4px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Enterprise Intelligence • SOP Automation • Secure Access
          </div>

          <div style="
            margin-top:13px;
            font-size:10px;
            color:#cbd5e1;
          ">
            ◉ SYSTEM GENERATED VERIFICATION COMMUNICATION
          </div>

        </div>

      </div>
    `
  });
}




export async function sendPasswordResetOtp({
  to,
  firstName,
  otp
}) {
  return sendEmail({
    to,
    subject: "VeriCore AI - Password Reset OTP",
    text: `Hello ${firstName},

Your password reset OTP is:

${otp}

This OTP expires in ${env.OTP_EXPIRES_MINUTES} minutes.

If you did not request this, please secure your account.`,
    html: `
      <div style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:620px;
        margin:0 auto;
        padding:30px 20px;
        color:#172033;
        background:#ffffff;
      ">

        <!-- Enterprise Header -->
        <div style="
          text-align:center;
          padding-bottom:24px;
          border-bottom:1px solid #e5e9f0;
        ">

          <img
            src="https://res.cloudinary.com/fdwexjk4/image/upload/v1789891015/output-onlinegiftools.gif"
            alt="VeriCore AI"
            style="
              width:90px;
              height:90px;
              object-fit:contain;
              border-radius:16px;
              display:block;
              margin:0 auto 16px;
            "
          >

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:2px;
            color:#64748b;
            text-transform:uppercase;
          ">
            ◉ ENTERPRISE SOP AGENT
          </div>

          <h2 style="
            margin:10px 0 5px;
            font-size:24px;
            color:#111827;
            letter-spacing:-0.4px;
          ">
            VeriCore AI
          </h2>

          <p style="
            margin:0;
            font-size:13px;
            color:#64748b;
          ">
            Intelligent Enterprise Knowledge System
          </p>

        </div>

        <!-- Password Reset Introduction -->
        <div style="padding:28px 4px 18px;">

          <div style="
            font-size:26px;
            margin-bottom:10px;
          ">
            🧠 🔐
          </div>

          <p style="
            margin:0 0 8px;
            font-size:16px;
            color:#1f2937;
          ">
            Hello ${firstName},
          </p>

          <p style="
            margin:0;
            font-size:14px;
            line-height:1.7;
            color:#64748b;
          ">
            A secure password reset request has been initiated
            for your <strong style="color:#334155;">VeriCore AI</strong>
            enterprise identity.
          </p>

        </div>

        <!-- Neural Security Indicator -->
        <div style="
          text-align:center;
          padding:10px 0 16px;
        ">

          <div style="
            font-size:22px;
            letter-spacing:7px;
            color:#64748b;
          ">
            ◉ ─ ⬡ ─ ◉ ─ ⬡ ─ ◉
          </div>

          <p style="
            margin:9px 0 0;
            font-size:10px;
            font-weight:bold;
            letter-spacing:1.8px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Neural Security • Authentication Protocol
          </p>

        </div>

        <!-- OTP -->
        <div style="
          margin:10px 0 24px;
          padding:25px 20px;
          text-align:center;
          border:1px solid #dbe2ea;
          border-radius:14px;
          background:#f8fafc;
        ">

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:1.5px;
            color:#64748b;
            text-transform:uppercase;
            margin-bottom:12px;
          ">
            🔑 Password Reset Verification
          </div>

          <div style="
            font-size:11px;
            color:#94a3b8;
            margin-bottom:9px;
          ">
            ONE-TIME AUTHENTICATION CODE
          </div>

          <h1 style="
            margin:0;
            font-size:36px;
            line-height:1;
            letter-spacing:9px;
            color:#111827;
            font-weight:700;
          ">
            ${otp}
          </h1>

          <div style="
            margin-top:15px;
            font-size:12px;
            color:#64748b;
          ">
            ⏱ Valid for ${env.OTP_EXPIRES_MINUTES} minutes
          </div>

        </div>

        <!-- Security Protocol -->
        <div style="
          padding:18px 20px;
          border-left:3px solid #64748b;
          margin:22px 0;
        ">

          <p style="
            margin:0 0 9px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🛡 Secure Access Protocol
          </p>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.7;
            color:#64748b;
          ">
            Enter this verification code in the VeriCore AI
            authentication interface to continue the password
            reset process.
          </p>

        </div>

        <!-- Account Protection Notice -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:20px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            ⚠ Account Protection
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            If you did not request this, please secure your account.
            Never share this OTP with another person.
          </p>

        </div>

        <!-- Footer -->
        <div style="
          text-align:center;
          margin-top:28px;
          padding-top:20px;
          border-top:1px solid #e5e9f0;
        ">

          <div style="
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            VeriCore AI
          </div>

          <div style="
            margin-top:6px;
            font-size:10px;
            letter-spacing:1.4px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Enterprise Intelligence • SOP Automation • Secure Access
          </div>

          <div style="
            margin-top:13px;
            font-size:10px;
            color:#cbd5e1;
          ">
            ◉ SYSTEM GENERATED SECURITY COMMUNICATION
          </div>

        </div>

      </div>
    `
  });
}




export async function sendPasswordResetSuccess({
  to,
  firstName
}) {
  return sendEmail({
    to,
    subject: "VeriCore AI - Password Changed",
    text: `Hello ${firstName},

Your VeriCore AI password has been successfully changed.

If you did not make this change, contact support immediately.`,
    html: `
      <div style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:620px;
        margin:0 auto;
        padding:30px 20px;
        color:#172033;
        background:#ffffff;
      ">

        <!-- Enterprise Header -->
        <div style="
          text-align:center;
          padding-bottom:24px;
          border-bottom:1px solid #e5e9f0;
        ">

          <img
            src="https://res.cloudinary.com/fdwexjk4/image/upload/v1789891015/output-onlinegiftools.gif"
            alt="VeriCore AI"
            style="
              width:90px;
              height:90px;
              object-fit:contain;
              border-radius:16px;
              display:block;
              margin:0 auto 16px;
            "
          >

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:2px;
            color:#64748b;
            text-transform:uppercase;
          ">
            ◉ ENTERPRISE SOP AGENT
          </div>

          <h2 style="
            margin:10px 0 5px;
            font-size:24px;
            color:#111827;
            letter-spacing:-0.4px;
          ">
            VeriCore AI
          </h2>

          <p style="
            margin:0;
            font-size:13px;
            color:#64748b;
          ">
            Intelligent Enterprise Knowledge System
          </p>

        </div>

        <!-- Success Introduction -->
        <div style="padding:28px 4px 18px;">

          <div style="
            font-size:28px;
            margin-bottom:10px;
          ">
            🧠 ✓
          </div>

          <p style="
            margin:0 0 8px;
            font-size:16px;
            color:#1f2937;
          ">
            Hello ${firstName},
          </p>

          <p style="
            margin:0;
            font-size:14px;
            line-height:1.7;
            color:#64748b;
          ">
            Your
            <strong style="color:#334155;">
              VeriCore AI
            </strong>
            password has been successfully changed.
          </p>

        </div>

        <!-- Neural Authentication Status -->
        <div style="
          text-align:center;
          padding:10px 0 18px;
        ">

          <div style="
            font-size:22px;
            letter-spacing:7px;
            color:#64748b;
          ">
            ◉ ─ ⬡ ─ ◉ ─ ⬡ ─ ◉
          </div>

          <p style="
            margin:9px 0 0;
            font-size:10px;
            font-weight:bold;
            letter-spacing:1.8px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Neural Security • Credential Updated
          </p>

        </div>

        <!-- Success Status -->
        <div style="
          margin:8px 0 24px;
          padding:25px 20px;
          text-align:center;
          border:1px solid #dbe2ea;
          border-radius:14px;
          background:#f8fafc;
        ">

          <div style="
            font-size:32px;
            margin-bottom:12px;
          ">
            ✓
          </div>

          <div style="
            font-size:11px;
            font-weight:bold;
            letter-spacing:1.5px;
            color:#64748b;
            text-transform:uppercase;
            margin-bottom:10px;
          ">
            Credential Update Confirmed
          </div>

          <div style="
            font-size:15px;
            font-weight:bold;
            color:#334155;
          ">
            Password Successfully Changed
          </div>

          <div style="
            margin-top:10px;
            font-size:12px;
            color:#64748b;
          ">
            🔐 Your authentication credentials are now updated
          </div>

        </div>

        <!-- Security Status -->
        <div style="
          padding:18px 20px;
          border-left:3px solid #64748b;
          margin:22px 0;
        ">

          <p style="
            margin:0 0 9px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            🛡 Security Status
          </p>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.7;
            color:#64748b;
          ">
            Your VeriCore AI account credentials have been
            successfully updated and the new password is now
            active for authenticated access.
          </p>

        </div>

        <!-- Security Alert -->
        <div style="
          padding:17px 20px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          margin-top:20px;
        ">

          <p style="
            margin:0 0 7px;
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            ⚠ Account Security Alert
          </p>

          <p style="
            margin:0;
            font-size:12px;
            line-height:1.7;
            color:#64748b;
          ">
            If you did not make this change, contact support immediately.
            This notification is generated automatically to help protect
            your enterprise identity.
          </p>

        </div>

        <!-- Footer -->
        <div style="
          text-align:center;
          margin-top:28px;
          padding-top:20px;
          border-top:1px solid #e5e9f0;
        ">

          <div style="
            font-size:13px;
            font-weight:bold;
            color:#334155;
          ">
            VeriCore AI
          </div>

          <div style="
            margin-top:6px;
            font-size:10px;
            letter-spacing:1.4px;
            color:#94a3b8;
            text-transform:uppercase;
          ">
            Enterprise Intelligence • SOP Automation • Secure Access
          </div>

          <div style="
            margin-top:13px;
            font-size:10px;
            color:#cbd5e1;
          ">
            ◉ SYSTEM GENERATED SECURITY COMMUNICATION
          </div>

        </div>

      </div>
    `
  });
}

