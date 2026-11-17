import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "healthy",
      service: "vericore-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;