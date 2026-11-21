
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(
  new URL("./apps/api/", import.meta.url),
);

const testSetup = fileURLToPath(
  new URL("./apps/api/src/tests/setup.ts", import.meta.url),
);

export default defineConfig({
  root: apiRoot,

  test: {
    environment: "node",

    setupFiles: [testSetup],

    include: ["src/**/*.test.ts"],

    clearMocks: true,
    restoreMocks: true,
  },
});
