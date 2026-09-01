import { expect, test as base } from "@playwright/test";
import { installMockDashboardApi } from "./mock-dashboard-api";
import { getTestMode, getTestSettings } from "./test-config";

const mode = getTestMode();
const settings = getTestSettings(mode);

export const test = base.extend({
  page: async ({ page }, use) => {
    if (mode === "frontend") {
      await installMockDashboardApi(page.context(), settings);
    }

    await use(page);
  },
});

export { expect };
