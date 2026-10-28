process.env.NODE_ENV = "test";
process.env.PORT = "4000";

process.env.MONGODB_URI =
  "mongodb://127.0.0.1:27017/vericore_test";

process.env.JWT_ACCESS_SECRET = "a".repeat(64);
process.env.JWT_REFRESH_SECRET = "b".repeat(64);
process.env.OTP_HMAC_SECRET = "c".repeat(64);

process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "test@example.com";
process.env.SMTP_PASS = "test-password";
process.env.SMTP_FROM = "VeriCore AI <test@example.com>";

process.env.FRONTEND_URL = "http://localhost:3000";
process.env.TRUST_PROXY_HOPS = "0";
