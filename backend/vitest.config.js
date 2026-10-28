
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/tests/setup.js"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
