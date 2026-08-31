import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  parseCliArguments,
  type CliArguments,
  type Mode,
} from "./cli-arguments.js";

export type TestMode = Exclude<Mode, "all">;

export interface E2eSettings {
  apiBaseUrl: string;
  password: string;
  username: string;
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
const TEST_CREDENTIAL_ENV_NAMES = ["USERNAME", "PASSWORD"] as const;
export const TEST_RUN_ARGUMENTS_ENV = "CCC_TEST_RUN_ARGUMENTS";
export const TEST_CLIENT_NAME = "Carriers Testing";
export const TEST_CLINIC_NAME = "Carrier testing clinic";

let environmentLoaded = false;

export function loadE2eEnvironment(): void {
  if (environmentLoaded) {
    return;
  }

  clearTestCredentials();

  const e2eEnvFilePath = resolve(process.cwd(), ENV_FILE_NAME);
  if (existsSync(e2eEnvFilePath)) {
    loadEnvFile(e2eEnvFilePath);
  }

  const e2eCredentials = readTestCredentials();
  const convexEnvFilePath = resolve(process.cwd(), CONVEX_ENV_FILE_NAME);
  if (existsSync(convexEnvFilePath)) {
    loadEnvFile(convexEnvFilePath);
  }

  restoreTestCredentials(e2eCredentials);

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

export function getTargetUrl(mode: TestMode): string {
  return mode === "production" ? DEFAULT_PRODUCTION_URL : DEFAULT_DEV_URL;
}

export function getTestSettings(mode: TestMode = getTestMode()): E2eSettings {
  loadE2eEnvironment();
  const argumentsValue = getRuntimeCliArguments();

  const missingArguments = [
    ["--execution-sheet", argumentsValue.executionSheet],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  const username = process.env["USERNAME"]?.trim() ?? "";
  const password = process.env["PASSWORD"]?.trim() ?? "";
  const missingEnvironmentVariables = [
    ["USERNAME", username],
    ["PASSWORD", password],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingArguments.length > 0 || missingEnvironmentVariables.length > 0) {
    throw new Error(
      `Missing ${[...missingArguments, ...missingEnvironmentVariables].join(
        ", ",
      )}. Pass the execution sheet as a CLI argument and set USERNAME and PASSWORD in ${ENV_FILE_NAME}.`,
    );
  }

  const sheetName = argumentsValue.executionSheet?.trim() ?? "";
  const apiBaseUrl = getApiBaseUrl(mode);

  return {
    apiBaseUrl: ensureTrailingSlash(apiBaseUrl),
    password,
    username,
    mode,
    sheetName,
    targetUrl: getTargetUrl(mode),
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function clearTestCredentials(): void {
  TEST_CREDENTIAL_ENV_NAMES.forEach((name) => {
    delete process.env[name];
  });
}

function readTestCredentials(): Record<
  (typeof TEST_CREDENTIAL_ENV_NAMES)[number],
  string | undefined
> {
  return {
    PASSWORD: process.env["PASSWORD"],
    USERNAME: process.env["USERNAME"],
  };
}

function restoreTestCredentials(
  credentials: Record<
    (typeof TEST_CREDENTIAL_ENV_NAMES)[number],
    string | undefined
  >,
): void {
  TEST_CREDENTIAL_ENV_NAMES.forEach((name) => {
    const value = credentials[name];
    if (value === undefined) {
      delete process.env[name];
      return;
    }
    process.env[name] = value;
  });
}

function getApiBaseUrl(mode: TestMode): string {
  return mode === "production"
    ? DEFAULT_PRODUCTION_API_URL
    : DEFAULT_DEV_API_URL;
}
