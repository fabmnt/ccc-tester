import { defineConfig, devices } from "@playwright/test";
import {
  getTargetUrl,
  getTestMode,
  loadE2eEnvironment,
} from "./e2e/test-config";

loadE2eEnvironment();
const mode = getTestMode();
const reportFile =
  process.env["CCC_REPORT_FILE"] ?? `test-results/${mode}.json`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/artifacts",
  reporter: [["list"], ["json", { outputFile: reportFile }]],
  expect: {
    timeout: 30_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env["CCC_BASE_URL"] ?? getTargetUrl(mode),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
