import { defineConfig, devices } from "@playwright/test";
import {
  getRuntimeCliArguments,
  getTargetUrl,
  getTestMode,
  loadE2eEnvironment,
} from "./e2e/test-config";

loadE2eEnvironment();
const mode = getTestMode();
const argumentsValue = getRuntimeCliArguments();
const reportFile = `test-results/${mode}.json`;

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
    baseURL: getTargetUrl(mode, argumentsValue.baseUrl),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
