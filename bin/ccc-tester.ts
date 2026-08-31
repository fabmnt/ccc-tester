#!/usr/bin/env node

import { parseCliArguments } from "../e2e/cli-arguments.js";
import { runTestRun } from "../src/lib/test-runner.js";

function printHelp(): void {
  console.log(`Usage: pnpm ccc-tester -- [options] [playwright options]

Options:
  --mode <dev|production|frontend|all>  Target environment (default: dev)
  --access-token <token>                Dashboard access token
  --client-id <id>                     Dashboard client ID
  --clinic-id <id>                     Dashboard clinic ID
  --execution-id <id>                  Execution tab/room ID
  --execution-sheet <name>             Execution sheet name
  --base-url <url>                     Override the dashboard URL
  --api-base-url <url>                 Override the API URL for every mode
  --dev-api-base-url <url>             Override the dev API URL
  --production-api-base-url <url>      Override the production API URL
  --scope <scope>                      Dashboard area under test (default: execution)
  --route <path>                       Exact route tested; defaults to the scope route
  --save-results                       Save test results to the Convex database
  --help                               Show this help

Examples:
  pnpm ccc-tester -- --mode=frontend --client-id=client --clinic-id=clinic \\
    --execution-id=execution --execution-sheet=2026-08-28
  pnpm ccc-tester -- --mode=all --client-id=client --clinic-id=clinic \\
    --execution-id=execution --execution-sheet=2026-08-28 --headed --save-results`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (parseCliArguments(argv).help) {
    printHelp();
    return;
  }

  const { exitCode } = await runTestRun(argv);
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
