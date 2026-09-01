import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { CliArguments, ExecutableMode } from "../../e2e/cli-arguments.js";
import { TEST_CLIENT_NAME, TEST_CLINIC_NAME } from "../../e2e/test-config.js";
import {
  TEST_SCOPES,
  type TestResult,
  type TestScope,
} from "../../convex/validators.js";

const CONVEX_URL_ENV_VAR = "CONVEX_URL";
const CONVEX_WRITE_SECRET_ENV_VAR = "CONVEX_WRITE_SECRET";

interface PlaywrightReport {
  stats?: { startTime?: string };
  suites?: PlaywrightSuite[];
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  annotations?: PlaywrightAnnotation[];
  title?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightAnnotation {
  type?: string;
  description?: string;
}

interface PlaywrightResult {
  status?: string;
  duration?: number;
  startTime?: string;
  error?: { message?: string };
  attachments?: Array<{ name?: string; path?: string }>;
}

export interface ConvexReportOptions {
  /** Convex deployment URL; falls back to the CONVEX_URL environment variable. */
  convexUrl?: string;
  /** Shared secret for the write mutation; falls back to CONVEX_WRITE_SECRET. */
  writeSecret?: string;
}

type FinishedRunStatus = "passed" | "failed";

export async function startTestRunInConvex(
  modes: ExecutableMode[],
  cliArgs: CliArguments,
  runId: string,
  startedAt: number,
  options: ConvexReportOptions = {},
): Promise<void> {
  const connection = getConvexConnection(options);
  if (!connection) {
    logMissingConvexConfiguration("Starting test run");
    return;
  }

  const sheetName = cliArgs.executionSheet?.trim() ?? "";
  const outcome = await connection.client.mutation(anyApi.runChecks.start, {
    secret: connection.writeSecret,
    runId,
    modes,
    startedAt,
    clientId: TEST_CLIENT_NAME,
    clinicId: TEST_CLINIC_NAME,
    executionId: sheetName,
    sheetName,
  });
  if (outcome.created) {
    console.log(`Started tracking test run ${runId}.`);
  }
}

export async function finishTestRunInConvex(
  runId: string,
  status: FinishedRunStatus,
  options: ConvexReportOptions = {},
): Promise<void> {
  const connection = getConvexConnection(options);
  if (!connection) {
    logMissingConvexConfiguration("Finishing test run");
    return;
  }

  const outcome = await connection.client.mutation(anyApi.runChecks.finish, {
    secret: connection.writeSecret,
    runId,
    status,
  });
  if (outcome.updated) {
    console.log(`Finished tracking test run ${runId} (${status}).`);
  }
}

export async function saveTestResultsToConvex(
  mode: ExecutableMode,
  cliArgs: CliArguments,
  runId: string,
  options: ConvexReportOptions = {},
): Promise<void> {
  const connection = getConvexConnection(options);
  if (!connection) {
    logMissingConvexConfiguration("Saving test results");
    return;
  }

  const reportPath = resolve(process.cwd(), "test-results", `${mode}.json`);
  if (!existsSync(reportPath)) {
    console.error(
      `Playwright report not found at ${reportPath}. Skipping Convex save.`,
    );
    return;
  }

  const report = JSON.parse(
    readFileSync(reportPath, "utf8"),
  ) as PlaywrightReport;
  const results = parseTestResults(report, mode, cliArgs);
  if (results.length === 0) {
    console.error(
      `No executed tests found in ${reportPath}. Skipping Convex save.`,
    );
    return;
  }

  const outcome = await connection.client.mutation(anyApi.runChecks.save, {
    secret: connection.writeSecret,
    runId,
    mode,
    results,
  });
  const skippedRun =
    typeof outcome === "object" && outcome !== null && outcome.skipped === true;
  if (skippedRun) {
    console.log(
      `Results for run ${runId} already saved to Convex (${mode}). Nothing to do.`,
    );
  } else {
    console.log(`Saved ${results.length} test result(s) to Convex (${mode}).`);
  }
}

interface ConvexConnection {
  client: ConvexHttpClient;
  writeSecret: string;
}

function getConvexConnection(
  options: ConvexReportOptions,
): ConvexConnection | null {
  const convexUrl =
    options.convexUrl ?? process.env[CONVEX_URL_ENV_VAR]?.trim();
  const writeSecret =
    options.writeSecret ?? process.env[CONVEX_WRITE_SECRET_ENV_VAR]?.trim();
  if (!convexUrl || !writeSecret) {
    return null;
  }

  return {
    client: new ConvexHttpClient(convexUrl, { logger: false }),
    writeSecret,
  };
}

function logMissingConvexConfiguration(operation: string): void {
  console.error(
    `${operation} requires ${CONVEX_URL_ENV_VAR} and ${CONVEX_WRITE_SECRET_ENV_VAR} to be set in the environment.`,
  );
}

function parseTestResults(
  report: PlaywrightReport,
  mode: ExecutableMode,
  cliArgs: CliArguments,
): TestResult[] {
  const runStartedAt = parseTimestamp(report.stats?.startTime);
  const commitHash = getCommitHash();
  const results: TestResult[] = [];

  for (const spec of flattenSpecs(report.suites ?? [])) {
    for (const test of spec.tests ?? []) {
      const finalResult = test.results?.[test.results.length - 1];
      if (
        !finalResult ||
        finalResult.status === "skipped" ||
        finalResult.status === "didNotRun"
      ) {
        continue;
      }

      results.push({
        scope: getTestScope(test, cliArgs.scope),
        mode,
        status: finalResult.status === "passed" ? "passed" : "failed",
        startedAt:
          parseTimestamp(finalResult.startTime) ?? runStartedAt ?? Date.now(),
        durationMs: finalResult.duration ?? 0,
        testTitle: test.title ?? spec.title ?? "Unknown test",
        clientId: TEST_CLIENT_NAME,
        clinicId: TEST_CLINIC_NAME,
        executionId: cliArgs.executionSheet?.trim() ?? "",
        sheetName: cliArgs.executionSheet?.trim() ?? "",
        commitHash,
        errorMessage: finalResult.error?.message,
        tracePath: findAttachmentPath(finalResult, "trace"),
        screenshotPath: findAttachmentPath(finalResult, "screenshot"),
        videoPath: findAttachmentPath(finalResult, "video"),
      });
    }
  }

  return results;
}

function getTestScope(
  test: PlaywrightTest,
  fallbackScope: TestScope,
): TestScope {
  const declaredScope = test.annotations?.find(
    (annotation) => annotation.type === "scope",
  )?.description;
  if (declaredScope === undefined) {
    return fallbackScope;
  }
  if ((TEST_SCOPES as readonly string[]).includes(declaredScope)) {
    return declaredScope as TestScope;
  }
  throw new Error(
    `Unknown test scope annotation "${declaredScope}". Choose one of: ${TEST_SCOPES.join(", ")}.`,
  );
}

function flattenSpecs(suites: PlaywrightSuite[]): PlaywrightSpec[] {
  const specs: PlaywrightSpec[] = [];
  for (const suite of suites) {
    specs.push(...(suite.specs ?? []));
    specs.push(...flattenSpecs(suite.suites ?? []));
  }
  return specs;
}

function findAttachmentPath(
  result: PlaywrightResult,
  name: string,
): string | undefined {
  return result.attachments?.find(
    (attachment) => attachment.name === name && attachment.path,
  )?.path;
}

function parseTimestamp(value: string | undefined): number | undefined {
  const timestamp = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function getCommitHash(): string | undefined {
  const fromEnvironment = process.env["GITHUB_SHA"]?.trim();
  if (fromEnvironment) {
    return fromEnvironment;
  }

  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}
