#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  getForwardedArguments,
  parseCliArguments,
  type CliArguments,
  type ExecutableMode,
} from "../e2e/cli-arguments.js";
import { getTargetUrl, loadE2eEnvironment } from "../e2e/test-config.js";

function printHelp(): void {
  console.log(`Usage: pnpm ccc-tester -- [options] [playwright options]

Options:
  --mode <dev|production|frontend|all>  Target environment (default: dev)
  --client-id <id>                     Dashboard client ID
  --clinic-id <id>                     Dashboard clinic ID
  --execution-id <id>                  Execution tab/room ID
  --execution-sheet <name>             Execution sheet name
  --base-url <url>                     Override the dashboard URL
  --api-base-url <url>                 Override the API URL for every mode
  --dev-api-base-url <url>             Override the dev API URL
  --production-api-base-url <url>      Override the production API URL
  --help                               Show this help

Examples:
  pnpm ccc-tester -- --mode=frontend --client-id=client --clinic-id=clinic \\
    --execution-id=execution --execution-sheet=2026-08-28
  pnpm ccc-tester -- --mode=all --client-id=client --clinic-id=clinic \\
    --execution-id=execution --execution-sheet=2026-08-28 --headed`);
}

function validateArguments(argumentsValue: CliArguments): void {
  const missingArguments = [
    ["--client-id", argumentsValue.clientId],
    ["--clinic-id", argumentsValue.clinicId],
    ["--execution-id", argumentsValue.executionId],
    ["--execution-sheet", argumentsValue.executionSheet],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missingArguments.length > 0) {
    throw new Error(
      `Missing ${missingArguments.join(", ")}. Run with --help for usage.`,
    );
  }
}

function runPlaywright(
  mode: ExecutableMode,
  argumentsValue: CliArguments,
): Promise<number> {
  const require = createRequire(import.meta.url);
  const playwrightCliPath = require.resolve("@playwright/test/cli");
  const childArguments = [
    playwrightCliPath,
    "test",
    ...argumentsValue.playwrightArguments,
    "--",
    ...getForwardedArguments(argumentsValue, mode),
  ];

  console.log(
    `\nRunning CCCdashboard ${mode} E2E against ${getTargetUrl(mode, argumentsValue.baseUrl)}`,
  );

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, childArguments, {
      env: process.env,
      stdio: "inherit",
    });

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

async function main(): Promise<void> {
  loadE2eEnvironment();
  const argumentsValue = parseCliArguments(process.argv.slice(2));

  if (argumentsValue.help) {
    printHelp();
    return;
  }

  validateArguments(argumentsValue);

  const modes: ExecutableMode[] =
    argumentsValue.mode === "all"
      ? ["dev", "production", "frontend"]
      : [argumentsValue.mode];
  let exitCode = 0;

  for (const mode of modes) {
    const result = await runPlaywright(mode, argumentsValue);
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
