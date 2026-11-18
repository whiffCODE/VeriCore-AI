
import { Router } from "express";
import { HealthResponseSchema } from "@vericore/contracts";

const router = Router();

router.get("/", (_req, res) => {
  const response = HealthResponseSchema.parse({
    success: true,
    data: {
      status: "healthy",
      service: "vericore-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    },
  });

  res.status(200).json(response);
});

export default router;
