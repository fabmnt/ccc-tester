import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";

export default [
  {
    ignores: [
      ".astro/**",
      "convex/_generated/**",
      "dist/**",
      "dist-cli/**",
      "test-results/**",
      "**/*.ts",
      // Bejamas components use TypeScript frontmatter, which this ESLint parser cannot parse with TS 7.
      "src/components/ui/**",
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
