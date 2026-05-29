import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit suite runs DOM-free; backends are exercised via injected stubs and
    // the runtime is mocked, so no browser environment is required.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
