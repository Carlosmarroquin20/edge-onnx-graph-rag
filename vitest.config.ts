import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig `@core/*` -> `src/core/*` path mapping so tests can
      // import the core barrels the same way application code does.
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
    },
  },
  test: {
    // Unit suite runs DOM-free; backends are exercised via injected stubs and
    // the runtime is mocked, so no browser environment is required.
    environment: "node",
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
