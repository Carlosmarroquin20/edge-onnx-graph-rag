// Flat config (ESLint 9). TypeScript-aware linting over the source, app, and
// client layers. Kept non-type-checked for speed and determinism; `tsc` is the
// authoritative type gate. Generated/build artifacts are ignored.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "out/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsc (noUnusedLocals/Parameters) already gates unused symbols; allow the
      // underscore-prefixed convention for intentionally-ignored bindings.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
);
