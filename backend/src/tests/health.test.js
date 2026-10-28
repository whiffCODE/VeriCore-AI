import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("API health and routing", () => {
  it("returns a healthy response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe("healthy");
    expect(response.body.service).toBe("VeriCore AI");
  });

  it("returns 404 for an unknown API route", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
