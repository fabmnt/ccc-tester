import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";

export default [
  {
    ignores: [
      ".astro/**",
      "dist/**",
      "dist-cli/**",
      "test-results/**",
      "**/*.ts",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["astro.config.mjs", "bin/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...eslintPluginAstro.configs["flat/recommended"],
];
