import { expect, test } from "./test-fixtures";
import type { Download, Locator, Page, Request } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  openExecutionsHome,
  selectExecutionsClient,
  waitForGrid,
} from "./executions-e2e-helpers";
import { SECONDARY_API_ORIGIN } from "./mock-dashboard-api";
import {
  getTestMode,
  getTestSettings,
  TEST_CLIENT_NAME,
  TEST_CLINIC_NAME,
} from "./test-config";
import { acquireTestDataLock } from "./test-data-lock";

const mode = getTestMode();
const settings = getTestSettings(mode);
const TEST_DATA_LOCK_TIMEOUT_MS = 10 * 60 * 1_000;
const FORM_LOCAL_STORAGE_KEY = "formless";
const execFileAsync = promisify(execFile);

type BookmarkValues = Record<string, string>;

interface OpenFormResult {
  page: Page;
  fileId: string;
  initialBookmarks: BookmarkValues;
}

interface UploadPayload {
  bookmarks: BookmarkValues;
  fileId: string;
  filename: string;
  formlessConfig?: unknown;
  viewSettings?: unknown;
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe(
  "CCCdashboard editable form",
  { annotation: { type: "scope", description: "Edit form" } },
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

    test("loads the row form with the backend bookmark values", async ({
      page,
    }) => {
      const opened = await openExistingEditableForm(page);
      const rendered = await readRenderedBookmarks(opened.page);

      expect(Object.keys(rendered).length).toBeGreaterThan(0);
      for (const [bookmark, value] of Object.entries(rendered)) {
        expect(
          normalizeBookmarkValue(value),
          `Rendered value for ${bookmark}`,
        ).toBe(normalizeBookmarkValue(opened.initialBookmarks[bookmark] ?? ""));
      }
    });

    test("edits text, box, and toggle bookmarks and sends updated and untouched values", async ({
      page,
    }, testInfo) => {
      const opened = await openExistingEditableForm(page);
      const original = await readRenderedBookmarks(opened.page);
      const changes = await editEveryBookmarkType(opened.page, testInfo.testId);
      const expected = { ...original, ...changes };
      await opened.page.route("**/api/drive/upload-formless/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        }),
      );
      const upload = waitForUpload(opened.page, settings.apiBaseUrl);
      await confirmSave(opened.page);
      const payload = (await upload).postDataJSON() as UploadPayload;

      expect(payload.fileId).toBe(opened.fileId);
      expect(normalizeBookmarkValues(payload.bookmarks)).toMatchObject(
        normalizeBookmarkValues(expected),
      );
      expect(payload.bookmarks["__NoMissings"]).toBe("true");
    });

    test("refreshes bookmark data and persists a successful backend update", async ({
      page,
    }, testInfo) => {
      const opened = await openExistingEditableForm(page);
      const original = await readRenderedBookmarks(opened.page);
      const text = opened.page
        .locator('formless-text-input [contenteditable="true"]')
        .first();
      const bookmark = await requiredAttribute(text, "id");
      const value = marker(testInfo.testId, "persisted");

      try {
        await text.fill(value);
        await text.blur();
        const upload = waitForUploadResponse(opened.page, settings.apiBaseUrl);
        await confirmSave(opened.page);
        const uploadResponse = await upload;
        if (!uploadResponse.ok()) {
          throw new Error(
            `Form save failed with HTTP ${uploadResponse.status()}: ${(await uploadResponse.text()).slice(0, 500)}`,
          );
        }
        await expect(opened.page.locator(cssId(bookmark))).toHaveText(value);
        await opened.page.reload({ waitUntil: "domcontentloaded" });
        await discardRecoverableChanges(opened.page);
        await waitForEditableForm(opened.page);
        await expect(opened.page.locator(cssId(bookmark))).toHaveText(value);
      } finally {
        await restoreBookmarks(opened.page, original, [bookmark]);
      }
    });

    test("recovers only unsaved local bookmark changes", async ({
      page,
    }, testInfo) => {
      const opened = await openExistingEditableForm(page);
      const text = opened.page
        .locator('formless-text-input [contenteditable="true"]')
        .first();
      await expect(text).toBeVisible();
      const bookmark = await requiredAttribute(text, "id");
      const recoveredValue = marker(testInfo.testId, "recovered");

      await opened.page.evaluate(
        ({ fileId, bookmark, recoveredValue }) => {
          localStorage.setItem(
            "formless",
            JSON.stringify([
              { fileId, bookmarks: { [bookmark]: recoveredValue } },
            ]),
          );
        },
        { fileId: opened.fileId, bookmark, recoveredValue },
      );
      await opened.page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        opened.page.locator("#confirm-recover-formless"),
      ).toBeVisible();
      await opened.page
        .locator("#confirm-recover-formless")
        .getByRole("button", { name: /recover/i })
        .click();

      await expect(opened.page.locator(cssId(bookmark))).toHaveText(
        recoveredValue,
      );
      expect(
        await opened.page.evaluate(() => localStorage.getItem("formless")),
      ).toContain(recoveredValue);

      await opened.page.evaluate(
        (key) => localStorage.removeItem(key),
        FORM_LOCAL_STORAGE_KEY,
      );
    });

    test("missing bookmark visibility controls the upload payload", async ({
      page,
    }, testInfo) => {
      const opened = await openExistingEditableForm(page);
      await opened.page.route("**/api/drive/upload-formless/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        }),
      );
      const toggle = opened.page.getByRole("button", {
        name: /show missing|hide missing/i,
      });
      test.skip(
        (await toggle.count()) === 0,
        "The selected form has no missing template bookmarks.",
      );

      await expect(toggle).toContainText(/show/i);
      const hiddenUpload = waitForUpload(opened.page, settings.apiBaseUrl);
      const hiddenRefresh = waitForFormRefresh(opened.page);
      await confirmSave(opened.page);
      const hiddenPayload = (
        await hiddenUpload
      ).postDataJSON() as UploadPayload;
      await hiddenRefresh;
      await waitForEditableForm(opened.page);

      await toggle.click();
      const missingInput = opened.page
        .locator(
          '.missing-template-bookmark-input[contenteditable="true"], input.missing-template-bookmark-input:not(:disabled)',
        )
        .first();
      await expect(missingInput).toBeVisible();
      const missingBookmark = await requiredAttribute(missingInput, "id");
      const missingValue = marker(testInfo.testId, "missing");
      await setBookmarkValue(missingInput, missingValue);

      const shownUpload = waitForUpload(opened.page, settings.apiBaseUrl);
      const shownRefresh = waitForFormRefresh(opened.page);
      await confirmSave(opened.page);
      const shownPayload = (await shownUpload).postDataJSON() as UploadPayload;
      await shownRefresh;
      await waitForEditableForm(opened.page);
      expect(hiddenPayload.bookmarks).not.toHaveProperty(missingBookmark);
      expect(shownPayload.bookmarks[missingBookmark]).toBe(missingValue);

      await toggle.click();
      const hiddenAgainUpload = waitForUpload(opened.page, settings.apiBaseUrl);
      await confirmSave(opened.page);
      const hiddenAgainPayload = (
        await hiddenAgainUpload
      ).postDataJSON() as UploadPayload;
      expect(hiddenAgainPayload.bookmarks).not.toHaveProperty(missingBookmark);
    });

    test("exports the current form values and sends server-specific save fields", async ({
      page,
    }) => {
      const opened = await openExistingEditableForm(page);
      const rendered = await readRenderedBookmarks(opened.page);
      const generateRequest = opened.page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          request.method() === "POST" &&
          url.pathname.includes("/api/formless/generate-form/")
        );
      });
      const downloadPromise = opened.page.waitForEvent("download");
      await opened.page.getByRole("button", { name: /export/i }).click();
      const exportPayload = (await generateRequest).postDataJSON() as {
        bookmarks: BookmarkValues;
      };
      const download = await downloadPromise;

      expect(normalizeBookmarkValues(exportPayload.bookmarks)).toMatchObject(
        normalizeBookmarkValues(rendered),
      );
      expect(download.suggestedFilename()).toMatch(/\.docx$/i);
      const exportedBookmarks = await readDocxBookmarks(download);
      for (const [bookmark, value] of Object.entries(rendered)) {
        expect(
          exportedBookmarks,
          `Exported DOCX bookmark ${bookmark}`,
        ).toHaveProperty(bookmark);
        expect(normalizeBookmarkValue(exportedBookmarks[bookmark])).toBe(
          normalizeBookmarkValue(value),
        );
      }

      const primaryUpload = waitForUpload(opened.page, settings.apiBaseUrl);
      await confirmSave(opened.page);
      const primaryPayload = (
        await primaryUpload
      ).postDataJSON() as UploadPayload;
      expect(primaryPayload.formlessConfig).toBeUndefined();
      expect(primaryPayload.viewSettings).toBeUndefined();

      await opened.page.evaluate(() =>
        localStorage.setItem("selected-api-server", "secondary"),
      );
      if (mode !== "frontend") {
        await opened.page.route(`${SECONDARY_API_ORIGIN}/**`, async (route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: "{}",
            });
            return;
          }
          const requestUrl = new URL(route.request().url());
          const primaryUrl = new URL(
            requestUrl.pathname + requestUrl.search,
            settings.apiBaseUrl,
          );
          const response = await route.fetch({ url: primaryUrl.href });
          await route.fulfill({ response });
        });
      }
      await opened.page.reload({ waitUntil: "domcontentloaded" });
      await waitForEditableForm(opened.page);
      const secondaryUpload = waitForUpload(opened.page, SECONDARY_API_ORIGIN);
      await confirmSave(opened.page);
      const secondaryPayload = (
        await secondaryUpload
      ).postDataJSON() as UploadPayload;
      expect(secondaryPayload.formlessConfig).toBeDefined();
      expect(secondaryPayload.viewSettings).toBeDefined();
      await opened.page.evaluate(() =>
        localStorage.removeItem("selected-api-server"),
      );
    });

    test("create mode saves the selected config and redirects to edit with row context", async ({
      page,
    }) => {
      await openExecutionsThroughHome(page);
      const createButton = page
        .locator("button.grid-sticky-action-create-btn")
        .first();
      test.skip(
        (await createButton.count()) === 0,
        "The selected sheet has no row eligible for create mode.",
      );
      const rowResponsePromise = page.context().waitForEvent("response", {
        predicate: (response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            url.pathname === "/api/spreadsheets/get/" &&
            url.searchParams.get("range") === settings.sheetName
          );
        },
      });
      const popupPromise = page.waitForEvent("popup");
      await createButton.click();
      const formPage = await popupPromise;
      await formPage.waitForLoadState("domcontentloaded");
      expect((await rowResponsePromise).ok()).toBe(true);

      const config = formPage.locator(
        "page-wrapper select.form-select:not(#static-column)",
      );
      await expect(config).toBeEnabled();
      const options = await config
        .locator("option")
        .evaluateAll((items) =>
          items.map((item) => (item as HTMLOptionElement).value),
        );
      expect(options.length).toBeGreaterThan(0);
      const selectedConfig = options.at(-1)!;
      await config.selectOption(selectedConfig);

      await formPage.route("**/api/drive/create-formless/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ fileId: "ccc-e2e-created-file" }),
        }),
      );

      const createRequest = formPage.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          request.method() === "POST" &&
          url.pathname.includes("/api/drive/create-formless/")
        );
      });
      await formPage.getByRole("button", { name: /create/i }).click();
      const request = await createRequest;
      expect(new URL(request.url()).pathname).toContain(`/${selectedConfig}`);
      await expect(formPage).toHaveURL(/#\/edit\/form\/[^/]+\/\d+\?/);
      const routeUrl = hashUrl(formPage);
      expect(routeUrl.pathname.endsWith(`/${selectedConfig}`)).toBe(true);
      expect(routeUrl.searchParams.get("createMode")).toBeNull();
      expect(routeUrl.searchParams.get("fileId")).toBeTruthy();
      expect(routeUrl.searchParams.get("clientId")).toBeTruthy();
      expect(routeUrl.searchParams.get("clinicId")).toBeTruthy();
      expect(routeUrl.searchParams.get("date")).toBe(settings.sheetName);
      expect(routeUrl.searchParams.get("row")).toMatch(/^\d+$/);
    });
  },
);

async function openExistingEditableForm(page: Page): Promise<OpenFormResult> {
  await openExecutionsThroughHome(page);
  const docxButton = page.locator(".docx-action-btn:not(.disabled)").nth(1);
  await expect(docxButton).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await docxButton.click();
  const formPage = await popupPromise;
  const fileResponse = formPage.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.includes("/api/drive/download-formless/")
    );
  });
  await formPage.waitForLoadState("domcontentloaded");
  await expect(formPage).toHaveURL(/#\/edit\/form\/[^/]+\/\d+/);
  const response = await fileResponse;
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as {
    bookmarks: Array<{ name: string; value: string }>;
  };
  await waitForEditableForm(formPage);
  const fileId = hashUrl(formPage).searchParams.get("fileId");
  expect(fileId).toBeTruthy();
  return {
    page: formPage,
    fileId: fileId!,
    initialBookmarks: Object.fromEntries(
      data.bookmarks.map(({ name, value }) => [name, value]),
    ),
  };
}

async function openExecutionsThroughHome(page: Page): Promise<void> {
  await openExecutionsHome(page, settings);
  await selectExecutionsClient(page);
  await waitForGrid(page);
  const tab = page
    .locator("executions-rework-tabs .tab")
    .filter({ hasText: settings.sheetName });
  await expect(tab).toHaveCount(1);
  if (
    !(await tab.evaluate((element) => element.classList.contains("tab-active")))
  ) {
    await tab.click();
    await waitForGrid(page);
  }
}

async function waitForEditableForm(page: Page): Promise<void> {
  await expect(page.locator("editable-form .editable-form")).toBeVisible();
  await expect(page.locator(".editable-form-page .spinner-border")).toHaveCount(
    0,
  );
}

async function readRenderedBookmarks(page: Page): Promise<BookmarkValues> {
  return page
    .locator(
      'formless-text-input .text-bookmark[id], formless-box-input input[type="checkbox"][id], formless-toggle-input input[type="checkbox"][id]',
    )
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => {
          const input = element as HTMLInputElement;
          const value =
            input.type === "checkbox"
              ? input.checked
                ? "n"
                : "o"
              : (element.textContent ?? "");
          return [element.id, value];
        }),
      ),
    );
}

async function editEveryBookmarkType(
  page: Page,
  testId: string,
): Promise<BookmarkValues> {
  const changes: BookmarkValues = {};
  const text = page
    .locator('formless-text-input [contenteditable="true"]')
    .first();
  await expect(text).toBeVisible();
  const textId = await requiredAttribute(text, "id");
  changes[textId] = marker(testId, "text");
  await text.fill(changes[textId]);
  await text.blur();

  if (
    (await page
      .locator('formless-box-input input[type="checkbox"]:not(:disabled)')
      .count()) === 0 ||
    (await page
      .locator('formless-toggle-input input[type="checkbox"]:not(:disabled)')
      .count()) === 0
  ) {
    const showMissing = page.getByRole("button", { name: /show missing/i });
    await expect(showMissing).toBeVisible();
    await showMissing.click();
  }

  for (const [selector, type] of [
    ['formless-box-input input[type="checkbox"]:not(:disabled)', "box"],
    ['formless-toggle-input input[type="checkbox"]:not(:disabled)', "toggle"],
  ] as const) {
    const input = page.locator(selector).first();
    expect(
      await input.count(),
      `No editable ${type} bookmark is configured`,
    ).toBe(1);
    const id = await requiredAttribute(input, "id");
    await input.click();
    changes[id] = (await input.isChecked()) ? "n" : "o";
  }
  return changes;
}

async function restoreBookmarks(
  page: Page,
  originals: BookmarkValues,
  bookmarks: string[],
) {
  await discardRecoverableChanges(page);
  let changed = false;
  for (const bookmark of bookmarks) {
    const input = page.locator(cssId(bookmark));
    if ((await input.getAttribute("type")) === "checkbox") {
      const shouldBeChecked = originals[bookmark] === "n";
      if ((await input.isChecked()) !== shouldBeChecked) {
        await input.click();
        changed = true;
      }
    } else {
      const original = originals[bookmark] ?? "";
      if ((await input.textContent()) !== original) {
        await input.fill(original);
        await input.blur();
        changed = true;
      }
    }
  }
  if (!changed) return;
  const upload = waitForUpload(page, settings.apiBaseUrl);
  await confirmSave(page);
  await upload;
}

async function confirmSave(page: Page): Promise<void> {
  await page.getByRole("button", { name: /save/i }).first().click();
  const modal = page.locator("#confirm-save-form-with-data");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /ok|confirm|save|yes/i }).click();
}

function waitForUpload(page: Page, apiBaseUrl: string): Promise<Request> {
  const origin = new URL(apiBaseUrl).origin;
  return page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      url.origin === origin &&
      url.pathname.includes("/api/drive/upload-formless/")
    );
  });
}

function waitForUploadResponse(page: Page, apiBaseUrl: string) {
  const origin = new URL(apiBaseUrl).origin;
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === origin &&
      url.pathname.includes("/api/drive/upload-formless/")
    );
  });
}

function waitForFormRefresh(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.includes("/api/drive/download-formless/")
    );
  });
}

async function discardRecoverableChanges(page: Page): Promise<void> {
  const modal = page.locator("#confirm-recover-formless");
  if (!(await modal.isVisible())) return;
  await modal.getByRole("button", { name: /discard|cancel/i }).click();
  await expect(modal).toBeHidden();
}

async function setBookmarkValue(
  locator: Locator,
  value: string,
): Promise<void> {
  if ((await locator.getAttribute("type")) === "checkbox") {
    if (!(await locator.isChecked())) await locator.click();
    return;
  }
  await locator.fill(value);
  await locator.blur();
}

async function requiredAttribute(
  locator: Locator,
  name: string,
): Promise<string> {
  const value = await locator.getAttribute(name);
  expect(value).toBeTruthy();
  return value!;
}

function hashUrl(page: Page): URL {
  const pageUrl = new URL(page.url());
  return new URL(pageUrl.hash.slice(1), pageUrl.origin);
}

function marker(testId: string, suffix: string): string {
  return `CCC_E2E_${testId.replace(/[^a-zA-Z0-9]/g, "_")}_${suffix}`;
}

function normalizeBookmarkValue(value: string): string {
  const normalized = value.replaceAll("\u00a0", " ");
  return normalized.trim() === "" ? "" : normalized;
}

function normalizeBookmarkValues(values: BookmarkValues): BookmarkValues {
  return Object.fromEntries(
    Object.entries(values).map(([bookmark, value]) => [
      bookmark,
      normalizeBookmarkValue(value),
    ]),
  );
}

function cssId(id: string): string {
  return `[id=${JSON.stringify(id)}]`;
}

async function readDocxBookmarks(download: Download): Promise<BookmarkValues> {
  const path = await download.path();
  expect(path).toBeTruthy();
  const { stdout } = await execFileAsync(
    "unzip",
    ["-p", path!, "word/document.xml"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const bookmarks: BookmarkValues = {};
  const startPattern = /<w:bookmarkStart\b[^>]*\/>/g;

  for (const match of stdout.matchAll(startPattern)) {
    const startTag = match[0];
    const id = startTag.match(/w:id="([^"]+)"/)?.[1];
    const name = startTag.match(/w:name="([^"]+)"/)?.[1];
    if (!id || !name) continue;
    const contentStart = (match.index ?? 0) + startTag.length;
    const endPattern = new RegExp(
      `<w:bookmarkEnd\\b[^>]*w:id="${escapeRegExp(id)}"[^>]*/>`,
    );
    const content = stdout.slice(contentStart);
    const end = content.search(endPattern);
    if (end === -1) continue;
    bookmarks[decodeXml(name)] = [
      ...content.slice(0, end).matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g),
    ]
      .map((textMatch) => decodeXml(textMatch[1]))
      .join("");
  }
  return bookmarks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
