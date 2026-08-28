import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

export type TestMode = "dev" | "production" | "frontend";

export interface E2eSettings {
  accessToken: string;
  apiBaseUrl: string;
  clientId: string;
  clinicId: string;
  executionId: string;
  mode: TestMode;
  sheetName: string;
  targetUrl: string;
}

const ENV_FILE_NAME = ".env.e2e";
const DEFAULT_DEV_URL = "http://127.0.0.1:4200";
const DEFAULT_PRODUCTION_URL = "https://controlcentralcarrier.com";
const DEFAULT_DEV_API_URL = "https://dev-carrier.dentalautomation.ai/";
const DEFAULT_PRODUCTION_API_URL = "https://carriers.dentalautomation.ai/";

let environmentLoaded = false;

export function loadE2eEnvironment(): void {
  if (environmentLoaded) {
    return;
  }

  const envFilePath = resolve(process.cwd(), ENV_FILE_NAME);
  if (existsSync(envFilePath)) {
    loadEnvFile(envFilePath);
  }

  environmentLoaded = true;
}

export function getTestMode(): TestMode {
  loadE2eEnvironment();
  const mode = process.env["CCC_TEST_MODE"] ?? "dev";

  if (mode === "dev" || mode === "production" || mode === "frontend") {
    return mode;
  }

  throw new Error(`Unsupported CCC_TEST_MODE "${mode}".`);
}

export function getTargetUrl(mode: TestMode): string {
  const configuredUrl =
    mode === "production"
      ? process.env["CCC_PRODUCTION_URL"]
      : process.env["CCC_DEV_URL"];
  return (
    configuredUrl ??
    (mode === "production" ? DEFAULT_PRODUCTION_URL : DEFAULT_DEV_URL)
  );
}

export function getTestSettings(mode: TestMode = getTestMode()): E2eSettings {
  loadE2eEnvironment();

  const missingVariables = [
    "TEST_ACCESS_TOKEN",
    "CCC_CLIENT_ID",
    "CCC_CLINIC_ID",
    "CCC_EXECUTION_ID",
    "CCC_EXECUTION_SHEET",
  ].filter((name) => !process.env[name]?.trim());

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing ${missingVariables.join(", ")}. Add them to ${ENV_FILE_NAME} in ${process.cwd()} or set them in the environment.`,
    );
  }

  const accessToken = process.env["TEST_ACCESS_TOKEN"]?.trim() ?? "";
  const clientId = process.env["CCC_CLIENT_ID"]?.trim() ?? "";
  const clinicId = process.env["CCC_CLINIC_ID"]?.trim() ?? "";
  const executionId = process.env["CCC_EXECUTION_ID"]?.trim() ?? "";
  const sheetName = process.env["CCC_EXECUTION_SHEET"]?.trim() ?? "";
  const apiBaseUrl = getApiBaseUrl(mode);

  return {
    accessToken,
    apiBaseUrl: ensureTrailingSlash(apiBaseUrl),
    clientId,
    clinicId,
    executionId,
    mode,
    sheetName,
    targetUrl: process.env["CCC_BASE_URL"] ?? getTargetUrl(mode),
  };
}

export function buildExecutionsPagePath(settings: E2eSettings): string {
  const query = new URLSearchParams({
    clinic: settings.clinicId,
    sheet: settings.sheetName,
  });

  return `/#/executions/${encodeURIComponent(settings.clientId)}?${query.toString()}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function getApiBaseUrl(mode: TestMode): string {
  const modeSpecificUrl =
    mode === "production"
      ? process.env["CCC_PRODUCTION_API_BASE_URL"]
      : process.env["CCC_DEV_API_BASE_URL"];

  return (
    modeSpecificUrl ??
    process.env["CCC_API_BASE_URL"] ??
    (mode === "production" ? DEFAULT_PRODUCTION_API_URL : DEFAULT_DEV_API_URL)
  );
}
