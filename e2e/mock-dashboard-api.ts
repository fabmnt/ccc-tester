import type { BrowserContext, Request, Route } from "@playwright/test";
import type { E2eSettings } from "./test-config";
import {
  createMockDashboardData,
  MOCK_CLIENT_ID,
  type MockDashboardData,
} from "./executions-fixture";

const SYNC_API_ORIGIN = "https://carriersync.dentalautomation.ai";
export const SECONDARY_API_ORIGIN = "https://ccc-api.controlcentralcarrier.com";
const MOCK_USER_ID = "ccc-tester-user";
export const MOCK_ACCESS_TOKEN = "ccc-tester-frontend-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const JSON_HEADERS = {
  "access-control-allow-headers": "content-type, x-access-token",
  "access-control-allow-origin": "*",
  "content-type": JSON_CONTENT_TYPE,
};

export interface MockDashboardApiState {
  blockedExternalRequests: string[];
  mockedRequests: string[];
  mutationRequests: string[];
}

export async function installMockDashboardApi(
  context: BrowserContext,
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

  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    const isDashboardApiRequest =
      requestUrl.origin === apiOrigin ||
      requestUrl.origin === SECONDARY_API_ORIGIN ||
      (requestUrl.origin === appOrigin &&
        requestUrl.pathname.startsWith("/api/"));

    if (isDashboardApiRequest) {
      if (!SAFE_METHODS.has(request.method())) {
        state.mutationRequests.push(`${request.method()} ${request.url()}`);
      }
      state.mockedRequests.push(`${request.method()} ${request.url()}`);
      await fulfillDashboardRequest(route, request, requestUrl, fixture);
      return;
    }

    if (requestUrl.origin === appOrigin) {
      await route.continue();
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

  await context.routeWebSocket(
    (url) => url.hostname === new URL(SYNC_API_ORIGIN).hostname,
    async (webSocket) => {
      await webSocket.close({ code: 1000, reason: "ccc-tester-frontend-e2e" });
    },
  );

  return state;
}

function getDashboardResponse(
  requestUrl: URL,
  fixture: MockDashboardData,
): unknown {
  if (requestUrl.pathname === "/api/token") {
    return { token: MOCK_ACCESS_TOKEN };
  }

  if (
    requestUrl.pathname === "/api/users/me" ||
    requestUrl.pathname === "/api/v2/users/me"
  ) {
    return {
      _id: MOCK_USER_ID,
      fullName: "CCC Tester user",
      roles: [{ name: "QA", permission: [] }],
      twoFactor: { isEnabled: false },
      urlImage: "",
      username: "ccc-tester",
    };
  }

  if (requestUrl.pathname === "/api/notifications/my/false") {
    return [];
  }

  if (requestUrl.pathname === "/api/v2/customers") {
    return {
      customers: [fixture.client],
      query: {},
      totalDocs: 1,
      totalPages: 1,
    };
  }

  if (
    requestUrl.pathname === `/api/clients/all/${fixture.client._id}` ||
    requestUrl.pathname === `/api/clients/all/${MOCK_CLIENT_ID}`
  ) {
    return fixture.client;
  }

  if (requestUrl.pathname === "/api/spreadsheets/execution/tabs") {
    return fixture.tabs;
  }

  if (requestUrl.pathname === "/api/spreadsheets/get/") {
    return (
      fixture.executionRowsBySheet[
        requestUrl.searchParams.get("range") ?? ""
      ] ?? Object.values(fixture.executionRowsBySheet)[0]
    );
  }

  if (requestUrl.pathname === "/api/statusTypes") {
    return [
      {
        id: "mock-status-ready",
        patientStatus: "READY",
        resultStatus: "Pending",
      },
      {
        id: "mock-status-inactive",
        patientStatus: "INACTIVE",
        resultStatus: "Not Found",
      },
    ];
  }

  return [];
}

async function fulfillDashboardRequest(
  route: Route,
  request: Request,
  requestUrl: URL,
  fixture: MockDashboardData,
): Promise<void> {
  if (
    request.method() === "POST" &&
    requestUrl.pathname === "/api/spreadsheets/insert"
  ) {
    updateExecutionCell(request, fixture);
    await fulfillJson(route, {});
    return;
  }

  if (requestUrl.pathname.startsWith("/api/drive/download-formless/")) {
    await fulfillJson(route, {
      filename: fixture.form.filename,
      bookmarks: fixture.form.bookmarks,
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/api/drive/upload-formless/")) {
    updateFormBookmarks(request, fixture);
    await fulfillJson(route, {});
    return;
  }

  if (requestUrl.pathname.startsWith("/api/formless/generate-form/")) {
    await route.fulfill({
      body: createMockDocx(readBookmarks(request)),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      status: 200,
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/api/formless/")) {
    await fulfillJson(route, {
      _id: "ccc-tester-form",
      formlessConfigs: fixture.form.config,
      viewSettings: createMockViewSettings(),
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/api/drive/create-formless/")) {
    await fulfillJson(route, { fileId: "ccc-e2e-created-file" });
    return;
  }

  await fulfillJson(route, getDashboardResponse(requestUrl, fixture));
}

function updateExecutionCell(
  request: Request,
  fixture: MockDashboardData,
): void {
  const body = readJsonBody(request);
  const range = typeof body.range === "string" ? body.range : "";
  const values = body.values;
  if (!Array.isArray(values) || !Array.isArray(values[0])) return;

  const rangeMatch = /^(.*)!([A-Z]+)(\d+)$/.exec(range);
  if (!rangeMatch) return;

  const rows = fixture.executionRowsBySheet[rangeMatch[1]];
  if (!rows) return;

  const rowIndex = Number(rangeMatch[3]) - 1;
  const columnIndex = columnLetterToIndex(rangeMatch[2]);
  const value = values[0][0];
  if (typeof value !== "string" || !rows[rowIndex] || columnIndex < 0) return;

  rows[rowIndex][columnIndex] = value;
}

function updateFormBookmarks(
  request: Request,
  fixture: MockDashboardData,
): void {
  const body = readJsonBody(request);
  if (!isRecord(body.bookmarks)) return;

  const nextValues = body.bookmarks;
  fixture.form.bookmarks = fixture.form.bookmarks.map((bookmark) => {
    const nextValue = nextValues[bookmark.name];
    return {
      ...bookmark,
      value: typeof nextValue === "string" ? nextValue : bookmark.value,
    };
  });

  for (const [name, value] of Object.entries(nextValues)) {
    if (
      name === "__NoMissings" ||
      typeof value !== "string" ||
      fixture.form.bookmarks.some((bookmark) => bookmark.name === name)
    ) {
      continue;
    }

    fixture.form.bookmarks.push({
      id: `mock-${name}`,
      name,
      type: "Text",
      value,
    });
  }
}

function readBookmarks(request: Request): Record<string, string> {
  const body = readJsonBody(request);
  if (!isRecord(body.bookmarks)) return {};

  return Object.fromEntries(
    Object.entries(body.bookmarks).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readJsonBody(request: Request): Record<string, unknown> {
  try {
    const body = request.postDataJSON();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function columnLetterToIndex(value: string): number {
  let index = 0;
  for (const character of value) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }
  return index - 1;
}

function createMockViewSettings() {
  return {
    bookmarks: { breakAfterLabel: [] },
    title: {
      fontFamily: "Arial",
      size: 12,
      color: "#000000",
      bold: false,
      italics: false,
    },
    tables: {
      titles: {
        position: "left",
        bold: false,
        fontFamily: "Arial",
        italics: false,
        size: 10,
        color: "#000000",
      },
      texts: {
        fontFamily: "Arial",
        bold: false,
        size: 10,
        color: "#000000",
        italics: false,
      },
      cells: { color: "#ffffff", borderColor: "#000000" },
      headers: {
        texts: {
          color: "#000000",
          size: 10,
          fontFamily: "Arial",
          bold: false,
          italics: false,
        },
        cells: { color: "#ffffff", borderColor: "#000000" },
      },
    },
    logos: {
      includeDRLogo: false,
      includeFormlessLogo: false,
      clientLogos: [],
    },
    versionHash: "ccc-tester",
  };
}

function createMockDocx(bookmarks: Record<string, string>): Buffer {
  const bookmarkXml = Object.entries(bookmarks)
    .map(
      ([name, value], index) =>
        `<w:bookmarkStart w:id="${index}" w:name="${escapeXml(name)}"/><w:r><w:t>${escapeXml(value)}</w:t></w:r><w:bookmarkEnd w:id="${index}"/>`,
    )
    .join("");
  const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${bookmarkXml}</w:p></w:body></w:document>`;
  return createStoredZip("word/document.xml", Buffer.from(documentXml));
}

function createStoredZip(filename: string, content: Buffer): Buffer {
  const name = Buffer.from(filename);
  const checksum = crc32(content);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(0, 42);
  const centralDirectory = Buffer.concat([centralHeader, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localHeader.length + name.length + content.length, 16);
  return Buffer.concat([localHeader, name, content, centralDirectory, end]);
}

function crc32(value: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of value) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
    status: 200,
  });
}
