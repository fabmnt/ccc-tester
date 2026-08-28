import type { Page, Route } from "@playwright/test";
import type { E2eSettings } from "./test-config";
import {
  createMockDashboardData,
  type MockDashboardData,
} from "./executions-fixture";

const SYNC_API_ORIGIN = "https://carriersync.dentalautomation.ai";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const JSON_HEADERS = {
  "access-control-allow-headers": "content-type, x-access-token",
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

export interface MockDashboardApiState {
  blockedExternalRequests: string[];
  mockedRequests: string[];
  mutationRequests: string[];
}

export async function installMutationGuard(
  page: Page,
  apiBaseUrl: string,
): Promise<MockDashboardApiState> {
  const state: MockDashboardApiState = {
    blockedExternalRequests: [],
    mockedRequests: [],
    mutationRequests: [],
  };
  const apiOrigin = new URL(apiBaseUrl).origin;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (isDashboardMutation(request.method(), requestUrl, apiOrigin)) {
      state.mutationRequests.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });

  return state;
}

export async function installMockDashboardApi(
  page: Page,
  settings: E2eSettings,
): Promise<MockDashboardApiState> {
  const state: MockDashboardApiState = {
    blockedExternalRequests: [],
    mockedRequests: [],
    mutationRequests: [],
  };
  const fixture = createMockDashboardData(settings);
  const appOrigin = new URL(settings.targetUrl).origin;
  const apiOrigin = new URL(settings.apiBaseUrl).origin;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (isDashboardMutation(request.method(), requestUrl, apiOrigin)) {
      state.mutationRequests.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (requestUrl.origin === appOrigin) {
      await route.continue();
      return;
    }

    if (requestUrl.origin === apiOrigin) {
      state.mockedRequests.push(`${request.method()} ${request.url()}`);
      await fulfillJson(route, getDashboardResponse(requestUrl, fixture));
      return;
    }

    if (
      requestUrl.origin === SYNC_API_ORIGIN &&
      !requestUrl.pathname.startsWith("/socket.io")
    ) {
      state.mockedRequests.push(`${request.method()} ${request.url()}`);
      await fulfillJson(route, {
        code: 200,
        data: { rooms: [] },
        message: "ok",
      });
      return;
    }

    state.blockedExternalRequests.push(request.url());
    await route.abort("blockedbyclient");
  });

  await page.context().routeWebSocket(
    (url) => url.hostname === new URL(SYNC_API_ORIGIN).hostname,
    async (webSocket) => {
      await webSocket.close({ code: 1000, reason: "ccc-tester-frontend-e2e" });
    },
  );

  return state;
}

function isDashboardMutation(
  method: string,
  requestUrl: URL,
  apiOrigin: string,
): boolean {
  // The page uses POST sync presence calls while opening a sheet. These do not
  // change execution data, so only the execution/spreadsheet write APIs are guarded.
  if (requestUrl.origin !== apiOrigin || SAFE_METHODS.has(method)) {
    return false;
  }

  return (
    requestUrl.pathname.startsWith("/api/spreadsheets") ||
    requestUrl.pathname.startsWith("/api/v2/executions") ||
    requestUrl.pathname.startsWith("/api/v2/columns")
  );
}

function getDashboardResponse(
  requestUrl: URL,
  fixture: MockDashboardData,
): unknown {
  if (requestUrl.pathname === "/api/token") {
    return { token: "valid" };
  }

  if (
    requestUrl.pathname === "/api/users/me" ||
    requestUrl.pathname === "/api/v2/users/me"
  ) {
    return {
      _id: "ccc-tester-user",
      fullName: "CCC Tester user",
      roles: [{ name: "user", permission: [] }],
      twoFactor: { isEnabled: false },
      urlImage: "",
      username: "ccc-tester",
    };
  }

  if (requestUrl.pathname === "/api/notifications/my/false") {
    return [];
  }

  if (requestUrl.pathname === `/api/clients/all/${fixture.client._id}`) {
    return fixture.client;
  }

  if (requestUrl.pathname === "/api/spreadsheets/execution/tabs") {
    return fixture.tabs;
  }

  if (requestUrl.pathname === "/api/spreadsheets/get/") {
    return fixture.executionRows;
  }

  if (requestUrl.pathname === "/api/statusTypes") {
    return [];
  }

  return [];
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
    status: 200,
  });
}
