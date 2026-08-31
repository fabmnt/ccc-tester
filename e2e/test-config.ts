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
  password: string;
  username: string;
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
export const TEST_RUN_ARGUMENTS_ENV = "CCC_TEST_RUN_ARGUMENTS";

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

export function getRuntimeCliArguments(): CliArguments {
  const serializedArguments = process.env[TEST_RUN_ARGUMENTS_ENV];
  if (!serializedArguments) {
    return parseCliArguments(process.argv.slice(2));
  }

  let forwardedArguments: unknown;
  try {
    forwardedArguments = JSON.parse(serializedArguments);
  } catch (error) {
    throw new Error(
      `${TEST_RUN_ARGUMENTS_ENV} must contain a JSON array of CLI arguments.`,
      { cause: error },
    );
  }

  if (
    !Array.isArray(forwardedArguments) ||
    forwardedArguments.some((argument) => typeof argument !== "string")
  ) {
    throw new Error(
      `${TEST_RUN_ARGUMENTS_ENV} must contain a JSON array of CLI arguments.`,
    );
  }

  return parseCliArguments(forwardedArguments);
}

export function getTestMode(): TestMode {
  loadE2eEnvironment();
  const mode = getRuntimeCliArguments().mode;

  if (mode !== "all") {
    return mode;
  }

  throw new Error('The "all" mode is only supported by the ccc-tester CLI.');
}

export function getTargetUrl(
  mode: TestMode,
  baseUrl: string | undefined = getRuntimeCliArguments().baseUrl,
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
  const argumentsValue = getRuntimeCliArguments();

  const missingArguments = [
    ["--client-id", argumentsValue.clientId],
    ["--clinic-id", argumentsValue.clinicId],
    ["--execution-id", argumentsValue.executionId],
    ["--execution-sheet", argumentsValue.executionSheet],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  const accessToken =
    argumentsValue.accessToken?.trim() ||
    process.env["TEST_ACCESS_TOKEN"]?.trim() ||
    "";
  const username = process.env["USERNAME"]?.trim() ?? "";
  const password = process.env["PASSWORD"]?.trim() ?? "";
  const missingEnvironmentVariables =
    accessToken || (username && password)
      ? []
      : ["TEST_ACCESS_TOKEN or USERNAME/PASSWORD"];

  if (missingArguments.length > 0 || missingEnvironmentVariables.length > 0) {
    throw new Error(
      `Missing ${[...missingArguments, ...missingEnvironmentVariables].join(
        ", ",
      )}. Pass test values as CLI arguments and set credentials in ${ENV_FILE_NAME} or the environment.`,
    );
  }

  const clientId = argumentsValue.clientId?.trim() ?? "";
  const clinicId = argumentsValue.clinicId?.trim() ?? "";
  const executionId = argumentsValue.executionId?.trim() ?? "";
  const sheetName = argumentsValue.executionSheet?.trim() ?? "";
  const apiBaseUrl = getApiBaseUrl(mode, argumentsValue);

  return {
    accessToken,
    apiBaseUrl: ensureTrailingSlash(apiBaseUrl),
    clientId,
    password,
    username,
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
