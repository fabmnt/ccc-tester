import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: [
      ".astro/**",
      "convex/_generated/**",
      "dist/**",
      "dist-cli/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsParser,
      sourceType: "module",
    },
  },
  {
    files: ["astro.config.mjs", "bin/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...eslintPluginAstro.configs["flat/recommended"],
];
