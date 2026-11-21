process.env.NODE_ENV = "test";
process.env.MONGODB_URI =
  "mongodb://127.0.0.1:27017/vericore_test";
process.env.JWT_SECRET =
  "test-only-jwt-secret-at-least-32-characters";
process.env.OTP_SECRET =
  "test-only-otp-secret-at-least-32-characters";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.PORT = "4001";
process.env.ACCESS_TOKEN_TTL = "10m";

process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "test@example.com";
process.env.SMTP_PASSWORD = "test-only-password";
process.env.MAIL_FROM_NAME = "VeriCore AI Test";
process.env.MAIL_FROM_EMAIL = "test@example.com";