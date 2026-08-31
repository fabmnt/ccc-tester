#!/usr/bin/env node

import { parseCliArguments } from "../e2e/cli-arguments.js";
import { runTestRun } from "../src/lib/test-runner.js";

function printHelp(): void {
  console.log(`Usage: pnpm ccc-tester -- [options] [playwright options]

Options:
  --mode <dev|production|frontend|all>  Target environment (default: dev)
  --execution-sheet <name>             Execution sheet name
  --scope <scope>                      Dashboard area under test (default: execution)
  --save-results                       Save test results to the Convex database
  --help                               Show this help

Examples:
  pnpm ccc-tester -- --mode=frontend --execution-sheet=2026-08-28
  pnpm ccc-tester -- --mode=all --execution-sheet=2026-08-28 \\
    --headed --save-results`);
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
