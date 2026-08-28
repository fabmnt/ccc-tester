import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { CliArguments, ExecutableMode } from "../e2e/cli-arguments.js";
import { getTestRoute } from "../e2e/test-config.js";
import type { TestResult } from "../convex/validators.js";

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
  title?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightResult {
  status?: string;
  duration?: number;
  startTime?: string;
  error?: { message?: string };
  attachments?: Array<{ name?: string; path?: string }>;
}

export async function saveTestResultsToConvex(
  mode: ExecutableMode,
  cliArgs: CliArguments,
  runId: string,
): Promise<void> {
  const convexUrl = process.env[CONVEX_URL_ENV_VAR]?.trim();
  const writeSecret = process.env[CONVEX_WRITE_SECRET_ENV_VAR]?.trim();
  if (!convexUrl || !writeSecret) {
    console.error(
      `--save-results requires ${CONVEX_URL_ENV_VAR} and ${CONVEX_WRITE_SECRET_ENV_VAR} to be set in the environment. Skipping Convex save.`,
    );
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

  const client = new ConvexHttpClient(convexUrl, { logger: false });
  const outcome = await client.mutation(anyApi.testResults.save, {
    secret: writeSecret,
    runId,
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

function parseTestResults(
  report: PlaywrightReport,
  mode: ExecutableMode,
  cliArgs: CliArguments,
): TestResult[] {
  const runStartedAt = parseTimestamp(report.stats?.startTime);
  const commitHash = getCommitHash();
  const route = getTestRoute(cliArgs.scope, cliArgs);
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
        scope: cliArgs.scope,
        route,
        mode,
        status: finalResult.status === "passed" ? "passed" : "failed",
        startedAt:
          parseTimestamp(finalResult.startTime) ?? runStartedAt ?? Date.now(),
        durationMs: finalResult.duration ?? 0,
        testTitle: test.title ?? spec.title ?? "Unknown test",
        clientId: cliArgs.clientId?.trim() ?? "",
        clinicId: cliArgs.clinicId?.trim() ?? "",
        executionId: cliArgs.executionId?.trim() ?? "",
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
