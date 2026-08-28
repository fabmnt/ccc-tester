import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  parseCliArguments,
  type CliArguments,
  type Mode,
} from "./cli-arguments.js";
import type { TestScope } from "../convex/validators.js";

export type TestMode = Exclude<Mode, "all">;

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
const CONVEX_ENV_FILE_NAME = ".env.local";
const DEFAULT_DEV_URL = "http://127.0.0.1:4200";
const DEFAULT_PRODUCTION_URL = "https://controlcentralcarrier.com";
const DEFAULT_DEV_API_URL = "https://dev-carrier.dentalautomation.ai/";
const DEFAULT_PRODUCTION_API_URL = "https://carriers.dentalautomation.ai/";

let environmentLoaded = false;

export function loadE2eEnvironment(): void {
  if (environmentLoaded) {
    return;
  }

  for (const fileName of [ENV_FILE_NAME, CONVEX_ENV_FILE_NAME]) {
    const envFilePath = resolve(process.cwd(), fileName);
    if (existsSync(envFilePath)) {
      loadEnvFile(envFilePath);
    }
  }

  environmentLoaded = true;
}

export function getTestMode(): TestMode {
  loadE2eEnvironment();
  const mode = parseCliArguments(process.argv.slice(2)).mode;

  if (mode !== "all") {
    return mode;
  }

  throw new Error('The "all" mode is only supported by the ccc-tester CLI.');
}

export function getTargetUrl(
  mode: TestMode,
  baseUrl: string | undefined = parseCliArguments(process.argv.slice(2))
    .baseUrl,
): string {
  if (baseUrl) {
    return baseUrl;
  }

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
  const argumentsValue = parseCliArguments(process.argv.slice(2));

  const missingArguments = [
    ["--client-id", argumentsValue.clientId],
    ["--clinic-id", argumentsValue.clinicId],
    ["--execution-id", argumentsValue.executionId],
    ["--execution-sheet", argumentsValue.executionSheet],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  const missingEnvironmentVariables = ["TEST_ACCESS_TOKEN"].filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missingArguments.length > 0 || missingEnvironmentVariables.length > 0) {
    throw new Error(
      `Missing ${[...missingArguments, ...missingEnvironmentVariables].join(
        ", ",
      )}. Pass test values as CLI arguments and set TEST_ACCESS_TOKEN in ${ENV_FILE_NAME} or the environment.`,
    );
  }

  const accessToken = process.env["TEST_ACCESS_TOKEN"]?.trim() ?? "";
  const clientId = argumentsValue.clientId?.trim() ?? "";
  const clinicId = argumentsValue.clinicId?.trim() ?? "";
  const executionId = argumentsValue.executionId?.trim() ?? "";
  const sheetName = argumentsValue.executionSheet?.trim() ?? "";
  const apiBaseUrl = getApiBaseUrl(mode, argumentsValue);

  return {
    accessToken,
    apiBaseUrl: ensureTrailingSlash(apiBaseUrl),
    clientId,
    clinicId,
    executionId,
    mode,
    sheetName,
    targetUrl: getTargetUrl(mode, argumentsValue.baseUrl),
  };
}

export function buildExecutionsPagePath(
  settings: Pick<E2eSettings, "clientId" | "clinicId" | "sheetName">,
): string {
  const query = new URLSearchParams({
    clinic: settings.clinicId,
    sheet: settings.sheetName,
  });

  return `/#/executions/${encodeURIComponent(settings.clientId)}?${query.toString()}`;
}

export function getTestRoute(
  scope: TestScope,
  cliArgs: CliArguments,
): string | undefined {
  const explicitRoute = cliArgs.route?.trim();
  if (explicitRoute) {
    return explicitRoute;
  }

  if (scope === "execution") {
    return buildExecutionsPagePath({
      clientId: cliArgs.clientId ?? "",
      clinicId: cliArgs.clinicId ?? "",
      sheetName: cliArgs.executionSheet ?? "",
    });
  }

  return undefined;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function getApiBaseUrl(mode: TestMode, argumentsValue: CliArguments): string {
  const modeSpecificUrl =
    mode === "production"
      ? argumentsValue.productionApiBaseUrl
      : argumentsValue.devApiBaseUrl;

  return (
    modeSpecificUrl ??
    argumentsValue.apiBaseUrl ??
    (mode === "production" ? DEFAULT_PRODUCTION_API_URL : DEFAULT_DEV_API_URL)
  );
}
