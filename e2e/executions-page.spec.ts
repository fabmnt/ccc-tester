import { expect, test, type Page } from "@playwright/test";
import {
  buildExecutionsPagePath,
  getTestMode,
  getTestSettings,
  type E2eSettings,
} from "./test-config";
import {
  installMockDashboardApi,
  installMutationGuard,
  type MockDashboardApiState,
} from "./mock-dashboard-api";

const LOADED_CONTENT_SELECTOR =
  ".executions-rework-content-shell:not(.executions-rework-content-shell--loading)";

test.describe("CCCdashboard executions page", () => {
  test("loads the configured execution without mutating dashboard data", async ({
    page,
  }) => {
    const mode = getTestMode();
    const settings = getTestSettings(mode);
    const state = await installEnvironment(page, settings);
    const tabsResponsePromise = page.waitForResponse((candidate) => {
      const candidateUrl = new URL(candidate.url());
      return (
        candidateUrl.origin === new URL(settings.apiBaseUrl).origin &&
        candidateUrl.pathname === "/api/spreadsheets/execution/tabs"
      );
    });

    await page.addInitScript(
      ({ accessToken, apiBaseUrl }) => {
        window.localStorage.setItem("tokens", accessToken);
        window.sessionStorage.setItem("BASE_API", apiBaseUrl);
      },
      { accessToken: settings.accessToken, apiBaseUrl: settings.apiBaseUrl },
    );

    const response = await page.goto(buildExecutionsPagePath(settings), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);
    const tabsResponse = await tabsResponsePromise;
    expect(tabsResponse.ok()).toBe(true);
    expect(await tabsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: settings.executionId,
          title: settings.sheetName,
        }),
      ]),
    );

    await expect(page.locator(LOADED_CONTENT_SELECTOR)).toHaveCount(1);
    await expect(
      page.locator("executions-grid .grid-scroll-container"),
    ).toHaveCount(1);
    await expect(
      page.locator("executions-grid .grid-row").first(),
    ).toContainText("CCC Tester patient");
    await expect(page.locator(".executions-rework-header h4")).toContainText(
      settings.sheetName,
    );
    await expect(
      page.getByText("We couldn't load executions.", { exact: true }),
    ).toHaveCount(0);
    if (settings.mode === "frontend") {
      expect(state.mockedRequests).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`/api/clients/all/${settings.clientId}`),
          expect.stringContaining("/api/spreadsheets/execution/tabs"),
          expect.stringContaining("/api/spreadsheets/get/"),
        ]),
      );
    }
    expect(state.mutationRequests).toEqual([]);
  });
});

async function installEnvironment(
  page: Page,
  settings: E2eSettings,
): Promise<MockDashboardApiState> {
  if (settings.mode === "frontend") {
    return installMockDashboardApi(page, settings);
  }

  return installMutationGuard(page, settings.apiBaseUrl);
}
