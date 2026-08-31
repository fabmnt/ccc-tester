import { expect, type Locator, type Page } from "@playwright/test";
import {
  TEST_CLIENT_NAME,
  TEST_CLINIC_NAME,
  type E2eSettings,
} from "./test-config";

export const EXPECTED_CLIENT_NAME = TEST_CLIENT_NAME;
export const EXPECTED_CLINIC_NAME_FRAGMENT = TEST_CLINIC_NAME.toLowerCase();
export const LOADED_CONTENT_SELECTOR =
  ".executions-rework-content-shell:not(.executions-rework-content-shell--loading)";
const POINTER_RESET_POSITION = { x: 0, y: 0 } as const;

// This mirrors CCCdashboard's UsersService.login() endpoint. Authentication
// happens through the API; the tests never navigate to the dashboard login page.
const AUTH_LOGIN_URL = "https://carriers.dentalautomation.ai/api/v2/auth/login";
const API_WRITE_PATH = "/api/spreadsheets/insert";
const SPECIAL_COLUMN_PATTERN =
  /drive|file|document|url|status|audit|carrier|practice|clinic|verification|relationship/i;

export type TextEditor =
  "double-click" | "enter" | "direct-entry" | "expanded" | "toolbar";

export interface GridCellTarget {
  cell: Locator;
  columnIndex: number;
  header: string;
  originalValue: string;
}

interface RawTab {
  _id?: string;
  title?: string;
}

export async function authenticate(
  page: Page,
  settings: E2eSettings,
): Promise<void> {
  const response = await page.request.post(AUTH_LOGIN_URL, {
    data: {
      username: settings.username,
      password: settings.password,
    },
  });
  if (!response.ok()) {
    throw new Error(`Dashboard login failed with HTTP ${response.status()}.`);
  }

  const accessToken = extractAccessToken(await response.json());
  if (!accessToken) {
    throw new Error(
      "Dashboard login response did not include an access token.",
    );
  }

  await page.addInitScript(
    ({ token, apiBaseUrl }) => {
      window.localStorage.setItem("tokens", token);
      window.sessionStorage.setItem("BASE_API", apiBaseUrl);
    },
    { token: accessToken, apiBaseUrl: settings.apiBaseUrl },
  );
}

export async function openExecutionsHome(
  page: Page,
  settings: E2eSettings,
): Promise<void> {
  await authenticate(page, settings);
  const response = await page.goto("/#/executions", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Welcome to Executions", exact: true }),
  ).toBeVisible();
}

export async function selectExecutionsClient(page: Page): Promise<void> {
  const clientSearch = page.locator("#executions-shortcut-search");
  await expect(clientSearch).toBeVisible();
  await clientSearch.fill(TEST_CLIENT_NAME);

  const clientShortcut = page
    .locator(".executions-client-shortcut")
    .filter({ hasText: TEST_CLIENT_NAME });
  await expect(clientShortcut).toHaveCount(1);
  await clientShortcut.click();

  const clinicShortcut = page
    .locator(".executions-client-folder .executions-clinic-shortcut")
    .filter({ hasText: TEST_CLINIC_NAME });
  await expect(clinicShortcut).toHaveCount(1);
  await clinicShortcut.click();
}

export async function openExecutionsClient(
  page: Page,
  settings: E2eSettings,
): Promise<void> {
  await authenticate(page, settings);

  const clientResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.origin === new URL(settings.apiBaseUrl).origin &&
      url.pathname.startsWith("/api/clients/all/")
    );
  });
  const tabsResponsePromise = page
    .waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.origin === new URL(settings.apiBaseUrl).origin &&
        url.pathname === "/api/spreadsheets/execution/tabs"
      );
    })
    .catch(() => null);

  const response = await page.goto("/#/executions", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.ok()).toBe(true);

  await expect(
    page.getByRole("heading", { name: "Welcome to Executions", exact: true }),
  ).toBeVisible();
  await selectExecutionsClient(page);

  const clientResponse = await clientResponsePromise;
  await assertApiResponse(clientResponse, "client details");
  const client = (await clientResponse.json()) as {
    clientName?: string;
    clinic?: Array<{ _id?: string; clinicName?: string }>;
  };
  expect(client.clientName).toBe(EXPECTED_CLIENT_NAME);

  const selectedClinic = client.clinic?.find(
    (clinic) => clinic.clinicName === TEST_CLINIC_NAME,
  );
  expect(selectedClinic).toBeDefined();
  expect(selectedClinic?.clinicName?.toLowerCase()).toContain(
    EXPECTED_CLINIC_NAME_FRAGMENT,
  );

  const tabsResponse = await tabsResponsePromise;
  if (!tabsResponse) {
    throw new Error("The execution tabs request was not observed.");
  }
  await assertApiResponse(tabsResponse, "execution tabs");
  const tabs = (await tabsResponse.json()) as RawTab[];
  expect(tabs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: settings.sheetName,
      }),
    ]),
  );

  const configuredTab = page
    .locator("executions-rework-tabs .tab")
    .filter({ hasText: settings.sheetName });
  await expect(configuredTab).toHaveCount(1);
  await configuredTab.click();
  await expect(configuredTab).toHaveClass(/tab-active/);

  await waitForGrid(page);
}

async function assertApiResponse(
  response: {
    ok(): boolean;
    status(): number;
    text(): Promise<string>;
  },
  resource: string,
): Promise<void> {
  if (response.ok()) return;

  const body = await response
    .text()
    .then((text) => text.slice(0, 200))
    .catch(() => "response body unavailable");

  throw new Error(
    `The ${resource} request failed with HTTP ${response.status()}: ${body}`,
  );
}

export function getExecutionRouteContext(page: Page): {
  clientId: string;
  clinicId: string;
} {
  const pageUrl = new URL(page.url());
  const routeUrl = new URL(pageUrl.hash.slice(1), pageUrl.origin);
  const clientId = routeUrl.pathname.split("/").filter(Boolean).at(-1);
  const clinicId = routeUrl.searchParams.get("clinic");

  if (!clientId || !clinicId) {
    throw new Error(
      `Execution route does not contain client and clinic IDs: ${page.url()}`,
    );
  }

  return { clientId, clinicId };
}

export async function waitForGrid(page: Page): Promise<void> {
  await expect(page.locator(LOADED_CONTENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator("executions-grid")).toHaveCount(1);
  await expect(
    page.locator("executions-grid .grid-viewport .grid-row").first(),
  ).toBeVisible();
}

export function gridRows(page: Page): Locator {
  return page.locator("executions-grid .grid-viewport .grid-row");
}

export function gridHeaders(page: Page): Locator {
  return page.locator(
    "executions-grid .grid-sticky-header > .grid-header-cell",
  );
}

export function rowCells(row: Locator): Locator {
  return row.locator("executions-cell");
}

export async function cellText(cell: Locator): Promise<string> {
  const input = cell.locator("input.cell-input, textarea.cell-textarea");
  if (await input.count()) {
    return (await input.first().inputValue()).trim();
  }
  return (await cell.locator(".cell").first().innerText()).trim();
}

export async function getFirstTextCell(
  page: Page,
  options: { allowEmpty?: boolean } = {},
): Promise<GridCellTarget> {
  const row = gridRows(page).first();
  const cells = rowCells(row);
  const headers = gridHeaders(page);
  const candidates: GridCellTarget[] = [];

  for (let index = 0; index < (await cells.count()); index += 1) {
    const header = (await headers.nth(index).innerText()).trim();
    if (SPECIAL_COLUMN_PATTERN.test(header)) continue;

    const cell = cells.nth(index);
    const originalValue = await cellText(cell);
    const candidate = { cell, columnIndex: index, header, originalValue };
    candidates.push(candidate);
    if (originalValue) return candidate;
  }

  if (options.allowEmpty && candidates.length > 0) {
    return candidates[0];
  }

  throw new Error("The selected sheet has no ordinary text cell to edit.");
}

export async function getCellByHeader(
  page: Page,
  matcher: RegExp,
): Promise<GridCellTarget | null> {
  const row = gridRows(page).first();
  const cells = rowCells(row);
  const headers = gridHeaders(page);

  for (let index = 0; index < (await headers.count()); index += 1) {
    const header = (await headers.nth(index).innerText()).trim();
    if (!matcher.test(header)) continue;

    const cell = cells.nth(index);
    return {
      cell,
      columnIndex: index,
      header,
      originalValue: await cellText(cell),
    };
  }

  return null;
}

export async function selectCell(target: GridCellTarget): Promise<void> {
  const page = target.cell.page();
  const container = target.cell.locator(".cell-container");

  // Grid updates can remount the selected cell beneath the pointer and reopen
  // its hover actions. Dismiss that overlay before clicking the cell again.
  await page.mouse.move(POINTER_RESET_POSITION.x, POINTER_RESET_POSITION.y);
  await expect(page.locator(".cell-actions-popover:visible")).toHaveCount(0);
  if (
    await container.evaluate((element) =>
      element.classList.contains("selected"),
    )
  ) {
    return;
  }

  await container.click();
  await expect(container).toHaveClass(/selected/);
}

export async function setTextWithEditor(
  page: Page,
  settings: E2eSettings,
  target: GridCellTarget,
  value: string,
  editor: TextEditor,
): Promise<void> {
  if ((await cellText(target.cell)) === value) return;

  switch (editor) {
    case "double-click":
      await target.cell.locator(".cell-container").dblclick({
        position: { x: 8, y: 8 },
      });
      break;
    case "enter":
      await selectCell(target);
      await page.keyboard.press("Enter");
      break;
    case "direct-entry":
      await selectCell(target);
      await page.keyboard.press(value.charAt(0));
      break;
    case "expanded":
      await selectCell(target);
      await page.keyboard.press("Control+Enter");
      break;
    case "toolbar":
      await selectCell(target);
      break;
  }

  const editorLocator =
    editor === "expanded"
      ? target.cell.locator("textarea.cell-textarea")
      : editor === "toolbar"
        ? page.locator('input[name="cell-value"]')
        : target.cell.locator("input.cell-input");
  await expect(editorLocator).toBeVisible();
  await editorLocator.fill(value);

  const writeResponsePromise = waitForCellWrite(page, settings);
  await editorLocator.press("Enter");
  await assertCellWriteFinished(page, target.cell, value, writeResponsePromise);
}

export function waitForCellWrite(
  page: Page,
  settings: E2eSettings,
): Promise<unknown> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === new URL(settings.apiBaseUrl).origin &&
      url.pathname === API_WRITE_PATH
    );
  });
}

export async function assertCellWriteFinished(
  page: Page,
  cell: Locator,
  expectedValue: string,
  writeResponsePromise: Promise<unknown>,
): Promise<void> {
  const response = (await writeResponsePromise) as {
    ok: () => boolean;
  };
  expect(response.ok()).toBe(true);
  await expect(
    page.locator("executions-grid .cell-container.loading"),
  ).toHaveCount(0);
  await expect(cell.locator(".cell")).toHaveText(expectedValue);
}

export async function restoreCellValue(
  page: Page,
  settings: E2eSettings,
  target: GridCellTarget,
): Promise<void> {
  const currentValue = await cellText(target.cell);
  if (currentValue === target.originalValue) return;
  await setTextWithEditor(
    page,
    settings,
    target,
    target.originalValue,
    "double-click",
  );
}

export async function openCellActionsPopover(
  page: Page,
  target: GridCellTarget,
): Promise<Locator> {
  const cellContent = target.cell.locator(".cell");
  await expect(cellContent).toBeVisible();
  await cellContent.scrollIntoViewIfNeeded();

  const cellBox = await cellContent.boundingBox();
  if (!cellBox) {
    throw new Error("Selected cell content has no visible bounding box.");
  }

  // Selecting a cell mounts the hover target beneath the current pointer.
  // Move away first so the next real mouse move emits the target's mouseenter
  // event. Locator.hover() cannot be used here because the popover it opens
  // intercepts the same point while Playwright is checking actionability.
  await page.mouse.move(POINTER_RESET_POSITION.x, POINTER_RESET_POSITION.y);
  await page.mouse.move(
    cellBox.x + cellBox.width / 2,
    cellBox.y + cellBox.height / 2,
  );

  const actions = page.locator(".cell-actions-popover:visible").last();
  await expect(actions).toBeVisible();
  return actions;
}

export async function openCellDropdown(
  page: Page,
  target: GridCellTarget,
): Promise<Locator> {
  await selectCell(target);
  const actions = await openCellActionsPopover(page, target);
  const toggle = actions.locator(".dropdown-toggle-button");
  await expect(toggle).toBeVisible();
  await toggle.click();

  const menu = page.locator(".dropdown-menu:visible").last();
  await expect(menu).toBeVisible();
  return menu;
}

export async function waitForGridUpdates(page: Page): Promise<void> {
  await expect(
    page.locator("executions-grid .cell-container.loading"),
  ).toHaveCount(0);
}

export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

export function createMarker(testId: string, purpose: string): string {
  return `CCC_E2E_${testId.replace(/[^a-zA-Z0-9]/g, "_")}_${purpose}`;
}

export async function getRowNumber(row: Locator): Promise<number> {
  const text = await row.locator(".grid-row-number-cell").first().innerText();
  return Number.parseInt(text.trim(), 10);
}

function extractAccessToken(response: unknown, depth = 0): string {
  if (depth > 3 || response === null || typeof response !== "object") return "";

  for (const [key, value] of Object.entries(response)) {
    if (/refresh/i.test(key)) continue;
    if (
      /token$/i.test(key) &&
      typeof value === "string" &&
      value.length >= 20
    ) {
      return value;
    }
    const nestedToken = extractAccessToken(value, depth + 1);
    if (nestedToken) return nestedToken;
  }
  return "";
}
