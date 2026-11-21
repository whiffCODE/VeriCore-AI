
import type { OtpPurpose } from "../../models/email-otp.model.js";

// --------------------------------------------------
// Email template types
// --------------------------------------------------

interface OtpEmailOptions {
  code: string;
  purpose: OtpPurpose;
  expiresInMinutes?: number;
}

interface OtpEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// --------------------------------------------------
// Email content by OTP purpose
// --------------------------------------------------

const OTP_CONTENT: Record<
  OtpPurpose,
  {
    subject: string;
    heading: string;
    description: string;
  }
> = {
  registration: {
    subject: "Verify your email | VeriCore AI",
    heading: "Verify your email address",
    description:
      "Use the verification code below to continue creating your VeriCore AI account.",
  },

  password_reset: {
    subject: "Password reset verification | VeriCore AI",
    heading: "Reset your password",
    description:
      "Use the verification code below to verify your password reset request.",
  },

  email_change: {
    subject: "Confirm your new email | VeriCore AI",
    heading: "Confirm your email address",
    description:
      "Use the verification code below to confirm your new email address.",
  },
};

// --------------------------------------------------
// Reusable OTP email template
// --------------------------------------------------

export function createOtpEmailTemplate(
  options: OtpEmailOptions,
): OtpEmailTemplate {
  const {
    code,
    purpose,
    expiresInMinutes = 10,
  } = options;

  if (!/^\d{6}$/.test(code)) {
    throw new Error("Invalid OTP format.");
  }

  const content = OTP_CONTENT[purpose];

  if (!content) {
    throw new Error("Unsupported OTP email purpose.");
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${content.subject}</title>
</head>

<body style="
  margin: 0;
  padding: 32px 16px;
  background-color: #f4f4f5;
  font-family: Arial, Helvetica, sans-serif;
  color: #18181b;
">

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
  >
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width: 480px;
            background-color: #ffffff;
            border: 1px solid #e4e4e7;
          "
        >

          <tr>
            <td style="padding: 32px 32px 20px;">
              <p style="
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                letter-spacing: 1px;
              ">
                VERICORE AI
              </p>

              <p style="
                margin: 8px 0 0;
                font-size: 11px;
                color: #71717a;
                letter-spacing: 2px;
                text-transform: uppercase;
              ">
                Evidence before answers.
              </p>
            </td>
          </tr>

          <tr>
            <td style="
              padding: 24px 32px;
              border-top: 1px solid #e4e4e7;
            ">

              <h1 style="
                margin: 0 0 16px;
                font-size: 23px;
                line-height: 1.4;
                font-weight: 600;
              ">
                ${content.heading}
              </h1>

              <p style="
                margin: 0 0 24px;
                color: #52525b;
                font-size: 14px;
                line-height: 1.7;
              ">
                ${content.description}
              </p>

              <div style="
                padding: 22px;
                background-color: #f4f4f5;
                text-align: center;
              ">

                <p style="
                  margin: 0 0 10px;
                  color: #71717a;
                  font-size: 11px;
                  letter-spacing: 2px;
                  text-transform: uppercase;
                ">
                  Your verification code
                </p>

                <p style="
                  margin: 0;
                  color: #18181b;
                  font-size: 34px;
                  font-weight: 700;
                  letter-spacing: 9px;
                ">
                  ${code}
                </p>

              </div>

              <p style="
                margin: 24px 0 0;
                color: #52525b;
                font-size: 13px;
                line-height: 1.7;
              ">
                This code expires in
                <strong>${expiresInMinutes} minutes</strong>.
                Do not share it with anyone.
              </p>

              <p style="
                margin: 18px 0 0;
                color: #71717a;
                font-size: 12px;
                line-height: 1.7;
              ">
                If you did not request this code, you can
                safely ignore this email.
              </p>

            </td>
          </tr>

          <tr>
            <td style="
              padding: 22px 32px;
              border-top: 1px solid #e4e4e7;
            ">
              <p style="
                margin: 0;
                color: #a1a1aa;
                font-size: 11px;
                line-height: 1.6;
              ">
                Automated security message from VeriCore AI.
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

  const text = [
    "VERICORE AI",
    "",
    content.heading,
    content.description,
    "",
    `Verification code: ${code}`,
    `Expires in ${expiresInMinutes} minutes.`,
    "",
    "Do not share this code with anyone.",
    "If you did not request this code, ignore this email.",
  ].join("\n");

  return {
    subject: content.subject,
    html,
    text,
  };
}
