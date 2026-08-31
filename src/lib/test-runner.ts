import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  getForwardedArguments,
  parseCliArguments,
  type CliArguments,
  type ExecutableMode,
  type Mode,
} from "../../e2e/cli-arguments.js";
import {
  getTargetUrl,
  loadE2eEnvironment,
  TEST_RUN_ARGUMENTS_ENV,
} from "../../e2e/test-config.js";
import type { TestScope } from "../../convex/validators.js";
import { saveTestResultsToConvex } from "./convex-report.js";

/** A test run request is already in progress; only one run may execute at a time. */
export class RunAlreadyActiveError extends Error {}

/** The run arguments are invalid (unknown mode/scope, missing required values). */
export class InvalidArgumentsError extends Error {}

export interface TestRunOptions {
  /** Convex deployment URL; falls back to the CONVEX_URL environment variable. */
  convexUrl?: string;
  /** Shared secret for the Convex write mutation; falls back to CONVEX_WRITE_SECRET. */
  writeSecret?: string;
}

/** Structured equivalent of the ccc-tester CLI options; see bin/ccc-tester.ts --help. */
export interface TestRunRequest {
  mode?: Mode;
  executionSheet?: string;
  scope?: TestScope;
  /** Extra arguments forwarded to the Playwright CLI (e.g. "--headed", "--grep=x"). Must not contain ccc-tester options. */
  playwrightArguments?: string[];
}

export interface TestRunOutcome {
  runId: string;
  modes: ExecutableMode[];
  exitCode: number;
}

let activeRunId: string | undefined;

export function isTestRunActive(): boolean {
  return activeRunId !== undefined;
}

/** Validates CLI arguments without starting a test run. */
export function validateTestRunArguments(argv: string[]): void {
  parseAndValidateArguments(argv);
}

/**
 * Translates a structured run request into ccc-tester CLI arguments.
 * Results saving is always enabled because every endpoint-triggered run
 * must persist its results to the database.
 */
export function buildCliArguments(request: TestRunRequest): string[] {
  const argv: string[] = [];

  const pushOption = (name: string, value: string | undefined): void => {
    if (value?.trim()) {
      argv.push(name, value);
    }
  };

  pushOption("--mode", request.mode);
  pushOption("--execution-sheet", request.executionSheet);
  pushOption("--scope", request.scope);
  argv.push(...(request.playwrightArguments ?? []));
  argv.push("--save-results");

  return argv;
}

/**
 * Runs the ccc-tester suite and waits for it to finish. Spawns one Playwright
 * child process per mode in parallel, writes reports to `test-results/`, and
 * saves results to Convex. Requires the process to run with the project root as cwd
 * (Playwright config, e2e specs, and report paths are cwd-relative).
 * Throws InvalidArgumentsError or RunAlreadyActiveError before running.
 */
export async function runTestRun(
  argv: string[],
  options: TestRunOptions = {},
): Promise<TestRunOutcome> {
  const prepared = prepareRun(argv);
  const exitCode = await executeRun(prepared, options);
  return { runId: prepared.runId, modes: prepared.modes, exitCode };
}

/**
 * Fire-and-forget variant for HTTP endpoints: validates synchronously, returns
 * the runId immediately, and executes the run in the background. Run failures
 * are logged to the server console; results are visible in the database.
 */
export function startTestRun(
  argv: string[],
  options: TestRunOptions = {},
): string {
  const prepared = prepareRun(argv);
  void executeRun(prepared, options).catch((error: unknown) => {
    console.error(`Test run ${prepared.runId} failed:`, error);
  });
  return prepared.runId;
}

interface PreparedRun {
  argumentsValue: CliArguments;
  modes: ExecutableMode[];
  runId: string;
}

function prepareRun(argv: string[]): PreparedRun {
  if (activeRunId !== undefined) {
    throw new RunAlreadyActiveError(
      `Test run ${activeRunId} is already in progress. Wait for it to finish.`,
    );
  }

  loadE2eEnvironment();
  const argumentsValue = parseAndValidateArguments(argv);

  return {
    argumentsValue,
    modes:
      argumentsValue.mode === "all"
        ? ["dev", "production", "frontend"]
        : [argumentsValue.mode],
    runId: randomUUID(),
  };
}

async function executeRun(
  prepared: PreparedRun,
  options: TestRunOptions,
): Promise<number> {
  activeRunId = prepared.runId;

  try {
    const exitCodes = await Promise.all(
      prepared.modes.map(async (mode) => {
        let exitCode = 1;

        try {
          exitCode = await runPlaywright(mode, prepared.argumentsValue);
        } catch (error) {
          console.error(
            `Failed to run ${mode} tests: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }

        if (prepared.argumentsValue.saveResults) {
          try {
            await saveTestResultsToConvex(
              mode,
              prepared.argumentsValue,
              prepared.runId,
              options,
            );
          } catch (error) {
            console.error(
              `Failed to save results for ${mode} to Convex: ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        }

        return exitCode;
      }),
    );

    return exitCodes.find((exitCode) => exitCode !== 0) ?? 0;
  } finally {
    activeRunId = undefined;
  }
}

function parseAndValidateArguments(argv: string[]): CliArguments {
  try {
    const argumentsValue = parseCliArguments(argv);
    validateArguments(argumentsValue);
    return argumentsValue;
  } catch (error) {
    throw new InvalidArgumentsError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function validateArguments(argumentsValue: CliArguments): void {
  const missingArguments = [
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
  const forwardedArguments = getForwardedArguments(argumentsValue, mode);
  const childArguments = [
    playwrightCliPath,
    "test",
    ...argumentsValue.playwrightArguments,
  ];

  console.log(
    `\nRunning CCCdashboard ${mode} E2E against ${getTargetUrl(mode)}`,
  );

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, childArguments, {
      env: {
        ...process.env,
        [TEST_RUN_ARGUMENTS_ENV]: JSON.stringify(forwardedArguments),
      },
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
