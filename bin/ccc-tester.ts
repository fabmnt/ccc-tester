#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";

const MODES = ["dev", "production", "frontend", "all"] as const;
type Mode = (typeof MODES)[number];
type ExecutableMode = Exclude<Mode, "all">;

type ParsedArguments =
  | { help: true }
  | {
      baseUrl: string | undefined;
      help: false;
      mode: Mode;
      playwrightArguments: string[];
    };

const DEFAULT_DEV_URL = "http://127.0.0.1:4200";
const DEFAULT_PRODUCTION_URL = "https://controlcentralcarrier.com";
const ENV_FILE_NAME = ".env.e2e";

function printHelp(): void {
  console.log(`Usage: pnpm ccc-tester -- [options] [playwright options]

Options:
  --mode <dev|production|frontend|all>  Target environment (default: dev)
  --base-url <url>                      Override the dashboard URL
  --help                                Show this help

Examples:
  pnpm ccc-tester -- --mode=frontend
  pnpm ccc-tester -- --mode=all --headed`);
}

function loadE2eEnvironment(): void {
  const envFilePath = resolve(process.cwd(), ENV_FILE_NAME);
  if (!existsSync(envFilePath)) {
    return;
  }

  loadEnvFile(envFilePath);
}

function parseArguments(argumentsList: string[]): ParsedArguments {
  let mode = process.env["CCC_TEST_MODE"] ?? "dev";
  let baseUrl: string | undefined;
  const playwrightArguments: string[] = [];

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }

    if (argument === "--") {
      continue;
    }

    if (argument === "--mode") {
      mode = argumentsList[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument?.startsWith("--mode=")) {
      mode = argument.slice("--mode=".length);
      continue;
    }

    if (argument === "--base-url") {
      baseUrl = argumentsList[index + 1];
      index += 1;
      continue;
    }

    if (argument?.startsWith("--base-url=")) {
      baseUrl = argument.slice("--base-url=".length);
      continue;
    }

    if (argument) {
      playwrightArguments.push(argument);
    }
  }

  if (!isMode(mode)) {
    throw new Error(
      `Unknown mode "${mode}". Choose one of: ${MODES.join(", ")}.`,
    );
  }

  return { baseUrl, help: false, mode, playwrightArguments };
}

function getTargetUrl(
  mode: ExecutableMode,
  baseUrl: string | undefined,
): string {
  if (baseUrl) {
    return baseUrl;
  }

  if (mode === "production") {
    return process.env["CCC_PRODUCTION_URL"] ?? DEFAULT_PRODUCTION_URL;
  }

  return process.env["CCC_DEV_URL"] ?? DEFAULT_DEV_URL;
}

function runPlaywright(
  mode: ExecutableMode,
  baseUrl: string,
  playwrightArguments: string[],
): Promise<number> {
  const require = createRequire(import.meta.url);
  const playwrightCliPath = require.resolve("@playwright/test/cli");
  const reportPath = `test-results/${mode}.json`;
  const childEnvironment = {
    ...process.env,
    CCC_BASE_URL: baseUrl,
    CCC_REPORT_FILE: reportPath,
    CCC_TEST_MODE: mode,
  };

  console.log(`\nRunning CCCdashboard ${mode} E2E against ${baseUrl}`);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [playwrightCliPath, "test", ...playwrightArguments],
      {
        env: childEnvironment,
        stdio: "inherit",
      },
    );

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolvePromise(1);
        return;
      }

      resolvePromise(code ?? 1);
    });
  });
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  loadE2eEnvironment();
  const parsedArguments = parseArguments(process.argv.slice(2));

  if (parsedArguments.help) {
    printHelp();
    return;
  }

  const modes: ExecutableMode[] =
    parsedArguments.mode === "all"
      ? ["dev", "production", "frontend"]
      : [parsedArguments.mode];
  let exitCode = 0;

  for (const mode of modes) {
    const result = await runPlaywright(
      mode,
      getTargetUrl(mode, parsedArguments.baseUrl),
      parsedArguments.playwrightArguments,
    );
    if (result !== 0) {
      exitCode = result;
    }
  }

  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
