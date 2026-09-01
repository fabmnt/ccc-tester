import { expect, test } from "./test-fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  cellText,
  createMarker,
  getCellByHeader,
  getExecutionRouteContext,
  getFirstTextCell,
  type GridCellTarget,
  getRowNumber,
  gridHeaders,
  gridRows,
  openCellActionsPopover,
  openCellDropdown,
  openExecutionsClient,
  openExecutionsHome,
  readClipboard,
  restoreCellValue,
  rowCells,
  selectCell,
  selectExecutionsClient,
  setTextWithEditor,
  waitForCellWrite,
  waitForGrid,
  waitForGridUpdates,
} from "./executions-e2e-helpers";
import {
  getTestMode,
  getTestSettings,
  TEST_CLIENT_NAME,
  TEST_CLINIC_NAME,
  type E2eSettings,
} from "./test-config";
import { acquireTestDataLock } from "./test-data-lock";

const mode = getTestMode();
const settings = getTestSettings(mode);
const TEST_DATA_LOCK_TIMEOUT_MS = 10 * 60 * 1_000;
const GENERAL_FILTERS = [
  {
    placeholder: "Verification Type",
    header: /type of verification|verification type/i,
  },
  {
    placeholder: "Carrier",
    header: /carrier name|insurance carrier|^carrier$/i,
  },
  { placeholder: "Status", header: /insurance verification status/i },
  {
    placeholder: "Final Audit",
    header: /final audit|update status|call center final confirmation/i,
  },
] as const;

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe(
  "CCCdashboard executions",
  { annotation: { type: "scope", description: "Executions" } },
  () => {
    let releaseTestDataLock: (() => Promise<void>) | undefined;

    test.beforeAll(async ({ browserName }, testInfo) => {
      void browserName;
      if (mode === "frontend") return;

      testInfo.setTimeout(TEST_DATA_LOCK_TIMEOUT_MS + 30_000);
      releaseTestDataLock = await acquireTestDataLock(
        `${TEST_CLIENT_NAME}:${TEST_CLINIC_NAME}:${settings.sheetName}`,
        TEST_DATA_LOCK_TIMEOUT_MS,
      );
    });

    test.afterAll(async () => {
      await releaseTestDataLock?.();
    });

    test("loads the executions home and opens Carriers Testing", async ({
      page,
    }) => {
      await openExecutionsHome(page, settings);
      await selectExecutionsClient(page);
      await expect(page).toHaveURL(/#\/executions\/[^?]+/);
      await waitForGrid(page);
    });

    test("loads the configured executions client page", async ({ page }) => {
      await openExecutionsClient(page, settings);
      await expect(page.locator(".executions-rework-header h4")).toContainText(
        settings.sheetName,
      );
      await expect(
        page.getByText("We couldn't load executions.", { exact: true }),
      ).toHaveCount(0);
    });

    test("navigates between sheets and loads the selected sheet rows", async ({
      page,
    }) => {
      await openExecutionsClient(page, settings);

      const tabs = page.locator("executions-rework-tabs .tab");
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThan(1);

      const selectedTab = page
        .locator("executions-rework-tabs .tab-active")
        .first();
      const selectedTitle = (await selectedTab.innerText()).trim();
      const selectedIndex = await tabs.evaluateAll(
        (tabElements, expectedTitle) =>
          tabElements.findIndex(
            (tabElement) => tabElement.textContent?.trim() === expectedTitle,
          ),
        selectedTitle,
      );
      const nextTabIndex = selectedIndex === 0 ? 1 : 0;
      const nextTab = tabs.nth(nextTabIndex);
      const nextTitle = (await nextTab.innerText()).trim();
      expect(nextTitle).not.toBe(selectedTitle);

      const rowsResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.origin === new URL(settings.apiBaseUrl).origin &&
          url.pathname === "/api/spreadsheets/get/" &&
          url.searchParams.get("range") === nextTitle
        );
      });
      await nextTab.click();
      const rowsResponse = await rowsResponsePromise;
      expect(rowsResponse.ok()).toBe(true);
      const rawRows = (await rowsResponse.json()) as string[][];
      expect(rawRows.length).toBeGreaterThan(1);

      await expect(nextTab).toHaveClass(/tab-active/);
      await expect(page.locator(".executions-rework-header h4")).toContainText(
        nextTitle,
      );
      expect(page.url()).toContain(`sheet=${encodeURIComponent(nextTitle)}`);

      const expectedValue = firstNonEmptyValue(rawRows[1]);
      await expect(gridRows(page).first()).toContainText(expectedValue);

      const originalTab = tabs.filter({ hasText: settings.sheetName }).first();
      const originalRowsResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.origin === new URL(settings.apiBaseUrl).origin &&
          url.pathname === "/api/spreadsheets/get/" &&
          url.searchParams.get("range") === settings.sheetName
        );
      });
      await originalTab.click();
      const originalRowsResponse = await originalRowsResponsePromise;
      expect(originalRowsResponse.ok()).toBe(true);
      await expect(originalTab).toHaveClass(/tab-active/);
      await expect(page.locator(".executions-rework-header h4")).toContainText(
        settings.sheetName,
      );
    });

    test("updates a selected cell after double-clicking it", async ({
      page,
    }, testInfo) => {
      await openExecutionsClient(page, settings);
      const target = await getFirstTextCell(page, { allowEmpty: true });
      const value = createMarker(testInfo.testId, "double_click");

      try {
        await setTextWithEditor(page, settings, target, value, "double-click");
        await expect(target.cell.locator(".cell")).toHaveText(value);
      } finally {
        await restoreCellValue(page, settings, target, value);
      }
    });

    test("updates a selected cell after pressing Enter", async ({
      page,
    }, testInfo) => {
      await openExecutionsClient(page, settings);
      const target = await getFirstTextCell(page, { allowEmpty: true });
      const value = createMarker(testInfo.testId, "enter");

      try {
        await setTextWithEditor(page, settings, target, value, "enter");
        await expect(target.cell.locator(".cell")).toHaveText(value);
      } finally {
        await restoreCellValue(page, settings, target, value);
      }
    });

    test("updates a selected cell with direct keyboard entry", async ({
      page,
    }, testInfo) => {
      await openExecutionsClient(page, settings);
      const target = await getFirstTextCell(page, { allowEmpty: true });
      const value = createMarker(testInfo.testId, "direct_entry");

      try {
        await setTextWithEditor(page, settings, target, value, "direct-entry");
        await expect(target.cell.locator(".cell")).toHaveText(value);
      } finally {
        await restoreCellValue(page, settings, target, value);
      }
    });

    test("updates a selected cell with the expanded editor", async ({
      page,
    }, testInfo) => {
      await openExecutionsClient(page, settings);
      const target = await getFirstTextCell(page, { allowEmpty: true });
      const value = createMarker(testInfo.testId, "expanded");

      try {
        await setTextWithEditor(page, settings, target, value, "expanded");
        await expect(target.cell.locator(".cell")).toHaveText(value);
      } finally {
        await restoreCellValue(page, settings, target, value);
      }
    });

    test("updates a selected cell from the toolbar", async ({
      page,
    }, testInfo) => {
      await openExecutionsClient(page, settings);
      const target = await getFirstTextCell(page, { allowEmpty: true });
      const value = createMarker(testInfo.testId, "toolbar");

      try {
        await setTextWithEditor(page, settings, target, value, "toolbar");
        await expect(target.cell.locator(".cell")).toHaveText(value);
      } finally {
        await restoreCellValue(page, settings, target, value);
      }
    });

    test("updates every available dropdown cell type", async ({ page }) => {
      await openExecutionsClient(page, settings);
      await page.locator("#columns-mode").selectOption("expanded");

      const dropdowns = [
        {
          name: "final audit",
          matcher:
            /^(final audit|update status|call center final confirmation)$/i,
        },
        {
          name: "verification type",
          matcher: /^(type of verification|verification type)$/i,
        },
        { name: "relationship", matcher: /^relationship(?: to subscriber)?$/i },
        { name: "patient status", matcher: /^insurance verification status$/i },
        {
          name: "result status",
          matcher:
            /^insurance verification process results?$|^verification results?$/i,
        },
      ];
      let exercised = 0;

      for (const dropdown of dropdowns) {
        const target = await getCellByHeader(page, dropdown.matcher);
        if (!target) continue;

        const menu = await openCellDropdown(page, target);
        const options = (await menu.locator(".dropdown-item").allTextContents())
          .map((option) => option.trim())
          .filter(Boolean);
        const nextValue = options.find(
          (option) => option !== target.originalValue,
        );
        expect(
          nextValue,
          `No alternate option for ${dropdown.name}`,
        ).toBeDefined();

        const pairedResult =
          dropdown.name === "patient status"
            ? await getCellByHeader(
                page,
                /^insurance verification process results?$|^verification results?$/i,
              )
            : null;

        let updated = false;
        try {
          const nextWriteResponsePromise = waitForCellWrite(
            page,
            settings,
            nextValue!,
          );
          await menu.getByText(nextValue!, { exact: true }).click();
          const nextWriteResponse = (await nextWriteResponsePromise) as {
            ok: () => boolean;
          };
          expect(nextWriteResponse.ok()).toBe(true);
          updated = true;
          await waitForGridUpdates(page);
          await expect(target.cell.locator(".cell")).toHaveText(nextValue!);
          exercised += 1;
        } finally {
          if (updated) {
            try {
              await restoreDropdownValue(page, settings, target, nextValue!);
              await expect(target.cell.locator(".cell")).toHaveText(
                target.originalValue,
              );
            } finally {
              if (
                pairedResult &&
                (await cellText(pairedResult.cell)) !==
                  pairedResult.originalValue
              ) {
                await setTextWithEditor(
                  page,
                  settings,
                  pairedResult,
                  pairedResult.originalValue,
                  "double-click",
                );
              }
            }
          }
        }
      }

      expect(exercised).toBeGreaterThan(0);
    });

    test("updates DONE and NOT FOUND sticky column cells", async ({ page }) => {
      await openExecutionsClient(page, settings);
      const statusTarget = await getCellByHeader(
        page,
        /^(final audit|update status|call center final confirmation)$/i,
      );
      expect(
        statusTarget,
        "No final audit status column is available",
      ).not.toBeNull();

      try {
        await setDropdownValue(page, settings, statusTarget!, "EMPTY");

        for (const columnClass of [
          "grid-sticky-done-col",
          "grid-sticky-nf-col",
        ]) {
          const row = await findRowWithCheckbox(page, columnClass);
          expect(row, `No ${columnClass} checkbox is available`).not.toBeNull();
          const checkbox = row!.locator(
            `.${columnClass} input[type="checkbox"]`,
          );

          const checkedValue =
            columnClass === "grid-sticky-done-col" ? "DONE" : "NOT FOUND";
          await toggleStickyCheckbox(page, settings, checkbox, checkedValue);
          try {
            await expect(checkbox).toBeChecked();
          } finally {
            await toggleStickyCheckbox(page, settings, checkbox, "EMPTY");
          }
          await expect(checkbox).not.toBeChecked();
        }
      } finally {
        await restoreDropdownValue(page, settings, statusTarget!, "EMPTY");
      }
    });

    test("copies and pastes a cell", async ({ page }, testInfo) => {
      await openExecutionsClient(page, settings);
      const source = await getFirstTextCell(page, { allowEmpty: true });
      const destination = await getSecondTextCell(page, source.columnIndex);
      const pastedValue = createMarker(testInfo.testId, "paste");

      await selectCell(source);
      await page.keyboard.press("Control+C");
      await expect.poll(() => readClipboard(page)).toBe(source.originalValue);

      const actions = await openCellActionsPopover(page, source);
      await actions.getByRole("button", { name: "Copy to clipboard" }).click();
      await expect.poll(() => readClipboard(page)).toBe(source.originalValue);

      try {
        await selectCell(destination);
        await page.evaluate(
          (value) => navigator.clipboard.writeText(value),
          pastedValue,
        );
        await page.locator(".grid-scroll-container").focus();
        const writeResponsePromise = waitForCellWrite(
          page,
          settings,
          pastedValue,
        );
        await page.keyboard.press("Control+V");
        const pasteEditor = destination.cell.locator("input.cell-input");
        await expect(pasteEditor).toBeVisible();
        await expect(pasteEditor).toHaveValue(pastedValue);
        await pasteEditor.press("Enter");
        const writeResponse = (await writeResponsePromise) as {
          ok: () => boolean;
        };
        expect(writeResponse.ok()).toBe(true);
        await waitForGridUpdates(page);
        await expect(destination.cell.locator(".cell")).toHaveText(pastedValue);
      } finally {
        await restoreCellValue(page, settings, destination, pastedValue);
      }
    });

    test("opens DOCX, PDF, and create form links in new tabs", async ({
      page,
    }) => {
      await openExecutionsClient(page, settings);

      const docxLink = page.locator("a.docx-action-btn:not(.disabled)").first();
      const pdfLink = page.locator("a.pdf-action-btn:not(.disabled)").first();
      await expect(docxLink).toHaveCount(1);
      await expect(pdfLink).toHaveCount(1);
      await assertLinkOpensInNewTab(page, docxLink);
      await assertLinkOpensInNewTab(page, pdfLink);

      const driveTarget = await getCellByHeader(
        page,
        /^(url drive|drive url|file url)$/i,
      );
      expect(driveTarget, "No Drive URL column is available").not.toBeNull();

      try {
        await setTextWithEditor(
          page,
          settings,
          driveTarget!,
          "",
          "double-click",
        );
        const createButton = page
          .locator("button.grid-sticky-action-create-btn")
          .first();
        await expect(createButton).toHaveCount(1);
        const createRow = createButton.locator(
          "xpath=ancestor::div[contains(@class, 'grid-row')][1]",
        );
        const rowNumber = await getRowNumber(createRow);
        const popupPromise = page.waitForEvent("popup");
        await createButton.click();
        const popup = await popupPromise;
        await expect.poll(() => popup.url()).toMatch(/#\/edit\/form\//);
        const createUrl = new URL(popup.url());
        expect(createUrl.origin).toBe(new URL(settings.targetUrl).origin);
        expect(createUrl.hash).toMatch(/^#\/edit\/form\/[^/]+\/[12]/);
        const createRouteUrl = new URL(
          createUrl.hash.slice(1),
          createUrl.origin,
        );
        const routeContext = getExecutionRouteContext(page);
        expect(createRouteUrl.searchParams.get("clientId")).toBe(
          routeContext.clientId,
        );
        expect(createRouteUrl.searchParams.get("clinicId")).toBe(
          routeContext.clinicId,
        );
        expect(createRouteUrl.searchParams.get("createMode")).toBe("true");
        expect(createRouteUrl.searchParams.get("date")).toBe(
          settings.sheetName,
        );
        expect(createRouteUrl.searchParams.get("row")).toBe(String(rowNumber));
        await popup.close();
      } finally {
        await restoreCellValue(page, settings, driveTarget!, "");
      }
    });

    test("applies specific column filters and general filters", async ({
      page,
    }) => {
      await openExecutionsClient(page, settings);
      await page.locator("#columns-mode").selectOption("expanded");

      const specificFilter = await openColumnFilterWithOptions(page);
      expect(specificFilter).not.toBeNull();
      const { button, panel, columnIndex, value } = specificFilter!;
      const option = panel.locator("label.form-check").first();
      await option.locator("input").check();
      await expect(
        button.locator(
          "xpath=ancestor::div[contains(@class, 'grid-header-cell-filter')][1]",
        ),
      ).toHaveClass(/active/);
      await assertColumnValuesStartWith(page, columnIndex, value);
      await panel
        .getByRole("button", { name: "Clean all", exact: true })
        .click();
      await expect(panel.locator("input:checked")).toHaveCount(0);

      for (const filterDefinition of GENERAL_FILTERS) {
        const filter = page.locator(
          `ng-select[placeholder="${filterDefinition.placeholder}"]`,
        );
        await expect(filter).toHaveCount(1);
        await filter.click();
        const panel = page.locator("ng-dropdown-panel:visible").last();
        const options = panel.locator(".ng-option");
        await expect(options.first()).toBeVisible();
        const filterValue = (await options.first().innerText()).trim();
        expect(filterValue).not.toBe("");
        await options.first().click();
        await expect(filter.locator(".ng-value-label").first()).toContainText(
          filterValue,
        );

        const columnIndex = await findHeaderIndex(
          page,
          filterDefinition.header,
        );
        expect(columnIndex).toBeGreaterThanOrEqual(0);
        await assertColumnValuesStartWith(page, columnIndex, filterValue);

        await filter.locator(".ng-clear-wrapper").click();
        await expect(filter.locator(".ng-value-label")).toHaveCount(0);
        await page.keyboard.press("Escape");
      }

      const firstRow = gridRows(page).first();
      const rowNumber = await getRowNumber(firstRow);
      const searchInput = page.locator('input[placeholder="Search..."]');
      await searchInput.fill(`'${rowNumber}'`);
      await searchInput.press("End");
      await expect(gridRows(page)).toHaveCount(1);
      await expect(
        gridRows(page).first().locator(".grid-row-number-cell").first(),
      ).toContainText(String(rowNumber));
      await searchInput.fill("");
      await searchInput.press("End");
    });

    test("runs every rows menu action", async ({ page }) => {
      await openExecutionsClient(page, settings);
      const row = gridRows(page).first();
      const rowNumber = await getRowNumber(row);

      let menu = await openRowsMenu(page, row);
      await menu.getByText("Copy link", { exact: true }).click();
      await expect
        .poll(() => readClipboard(page))
        .toContain(`search='${rowNumber}'`);

      menu = await openRowsMenu(page, row);
      await menu.getByText("Copy coordinates", { exact: true }).click();
      await expect
        .poll(() => readClipboard(page))
        .toContain(`Row: ${rowNumber}`);
      const coordinatesText = await readClipboard(page);
      expect(coordinatesText).toContain("Client: Carriers Testing");
      expect(coordinatesText).toContain("Clinic:");
      expect(coordinatesText).toContain("Link:");

      menu = await openRowsMenu(page, row);
      const rawRowAction = menu.getByText("Copy raw row", { exact: true });
      await rawRowAction.click();
      await expect.poll(() => readClipboard(page)).toMatch(/^\s*\[/);
      const rawRow = JSON.parse(await readClipboard(page)) as unknown;
      expect(Array.isArray(rawRow)).toBe(true);
      expect(Array.isArray((rawRow as unknown[])[0])).toBe(true);

      menu = await openRowsMenu(page, row);
      const incidentLink = menu.locator('a[href*="NewComplaints"]').first();
      await expect(incidentLink).toHaveCount(1);
      await assertLinkOpensInNewTab(page, incidentLink);
    });
  },
);

async function getSecondTextCell(page: Page, excludedIndex: number) {
  const row = gridRows(page).first();
  const cells = rowCells(row);
  const headers = gridHeaders(page);

  for (let index = 0; index < (await cells.count()); index += 1) {
    if (index === excludedIndex) continue;
    const header = (await headers.nth(index).innerText()).trim();
    if (
      /drive|file|document|url|status|audit|carrier|practice|clinic|verification|relationship/i.test(
        header,
      )
    ) {
      continue;
    }
    return {
      cell: cells.nth(index),
      columnIndex: index,
      header,
      originalValue: await cellText(cells.nth(index)),
    };
  }

  throw new Error("The selected sheet has no second ordinary text cell.");
}

async function findRowWithCheckbox(
  page: Page,
  columnClass: string,
): Promise<Locator | null> {
  const rows = gridRows(page);
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    if (await row.locator(`.${columnClass} input[type="checkbox"]`).count())
      return row;
  }
  return null;
}

async function toggleStickyCheckbox(
  page: Page,
  settings: E2eSettings,
  checkbox: Locator,
  expectedValue: string,
): Promise<void> {
  const writeResponsePromise = waitForCellWrite(page, settings, expectedValue);
  await checkbox.click();
  const response = (await writeResponsePromise) as { ok: () => boolean };
  expect(response.ok()).toBe(true);
  await waitForGridUpdates(page);
}

async function assertLinkOpensInNewTab(
  page: Page,
  link: Locator,
): Promise<void> {
  const expectedUrl = await link.getAttribute("href");
  expect(expectedUrl).toBeTruthy();
  await expect(link).toHaveAttribute("target", "_blank");
  const absoluteExpectedUrl = new URL(expectedUrl!, page.url()).href;
  const isExternal =
    new URL(absoluteExpectedUrl).origin !== new URL(page.url()).origin;
  if (isExternal) {
    await page.context().route(absoluteExpectedUrl, (route) => route.abort());
  }

  const popupPromise = page.waitForEvent("popup");
  try {
    await link.click();
    const popup = await popupPromise;
    if (!isExternal) {
      await expect.poll(() => popup.url()).toBe(absoluteExpectedUrl);
    }
    await popup.close();
  } finally {
    if (isExternal) {
      await page.context().unroute(absoluteExpectedUrl);
    }
  }
}

async function restoreDropdownValue(
  page: Page,
  settings: E2eSettings,
  target: GridCellTarget,
  expectedCurrentValue?: string,
): Promise<void> {
  const currentValue = await cellText(target.cell);
  if (currentValue === target.originalValue) return;
  if (
    expectedCurrentValue !== undefined &&
    currentValue !== expectedCurrentValue
  ) {
    throw new Error(
      `Refusing to restore ${target.header}: expected the test value ${JSON.stringify(expectedCurrentValue)}, but found ${JSON.stringify(currentValue)}.`,
    );
  }

  if (!target.originalValue) {
    await page.keyboard.press("Escape");
    await setTextWithEditor(
      page,
      settings,
      target,
      target.originalValue,
      "double-click",
    );
    return;
  }

  const menu = await openCellDropdown(page, target);
  const option = menu.getByText(target.originalValue, { exact: true });
  if (await option.count()) {
    const writeResponsePromise = waitForCellWrite(
      page,
      settings,
      target.originalValue,
    );
    await option.click();
    const response = (await writeResponsePromise) as { ok: () => boolean };
    expect(response.ok()).toBe(true);
    await waitForGridUpdates(page);
    return;
  }

  await page.keyboard.press("Escape");
  await setTextWithEditor(
    page,
    settings,
    target,
    target.originalValue,
    "double-click",
  );
}

async function setDropdownValue(
  page: Page,
  settings: E2eSettings,
  target: GridCellTarget,
  value: string,
): Promise<void> {
  if ((await cellText(target.cell)).toUpperCase() === value) return;

  const menu = await openCellDropdown(page, target);
  const option = menu.getByText(value, { exact: true });
  await expect(
    option,
    `${value} is not available in ${target.header}`,
  ).toHaveCount(1);
  const writeResponsePromise = waitForCellWrite(page, settings, value);
  await option.click();
  const response = (await writeResponsePromise) as { ok: () => boolean };
  expect(response.ok()).toBe(true);
  await waitForGridUpdates(page);
  await expect(target.cell.locator(".cell")).toHaveText(value);
}

async function openRowsMenu(page: Page, row: Locator): Promise<Locator> {
  await row.locator('button[title="More options"]').click();
  const menu = page.locator(".grid-copy-options-popper:visible").last();
  await expect(menu).toBeVisible();
  return menu;
}

async function openColumnFilterWithOptions(page: Page): Promise<{
  button: Locator;
  panel: Locator;
  columnIndex: number;
  value: string;
} | null> {
  const headers = gridHeaders(page);
  for (let index = 0; index < (await headers.count()); index += 1) {
    const button = headers
      .nth(index)
      .locator("button.executions-rework-filter-icon");
    if (!(await button.count())) continue;
    await button.click();
    const filterContent = page.locator(".filters-content:visible").last();
    await expect(filterContent).toBeVisible();
    const panel = filterContent.locator(
      "xpath=ancestor::div[contains(@class, 'popover')][1]",
    );
    const options = panel.locator("label.form-check");
    const hasOptions = await options
      .first()
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (hasOptions) {
      const value = (
        await options.first().locator(".filter-content").innerText()
      ).trim();
      return { button, panel, columnIndex: index, value };
    }
    await page.keyboard.press("Escape");
  }
  return null;
}

async function assertColumnValuesStartWith(
  page: Page,
  columnIndex: number,
  expectedValue: string,
): Promise<void> {
  const rows = gridRows(page);
  const expectedPattern = new RegExp(`^${escapeRegExp(expectedValue)}`);
  await expect
    .poll(async () => {
      const rowCount = await rows.count();
      if (rowCount === 0) return false;

      for (let index = 0; index < rowCount; index += 1) {
        const text = await cellText(rowCells(rows.nth(index)).nth(columnIndex));
        if (!expectedPattern.test(text)) return false;
      }
      return true;
    })
    .toBe(true);
}

async function findHeaderIndex(page: Page, matcher: RegExp): Promise<number> {
  const headers = gridHeaders(page);
  for (let index = 0; index < (await headers.count()); index += 1) {
    if (matcher.test((await headers.nth(index).innerText()).trim()))
      return index;
  }
  return -1;
}

function firstNonEmptyValue(row: string[] | undefined): string {
  const value = row?.find((cell) => cell.trim().length > 0)?.trim();
  if (!value) throw new Error("The selected sheet returned an empty data row.");
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
