import { CONVEX_URL, CONVEX_WRITE_SECRET } from "astro:env/server";
import { loadE2eEnvironment } from "../../e2e/test-config.js";
import {
  buildCliArguments,
  InvalidArgumentsError,
  RunAlreadyActiveError,
  startTestRun,
  validateTestRunArguments,
} from "./test-runner.js";
import type { TestRunPayload } from "./run-request";

export class MissingWriteSecretError extends Error {}

export function startRunFromRequest(request: TestRunPayload): string {
  const cliArguments = buildCliArguments(request);
  validateTestRunArguments(cliArguments);

  const writeSecret = resolveWriteSecret();
  if (!writeSecret) {
    throw new MissingWriteSecretError(
      "CONVEX_WRITE_SECRET is not configured. Test results cannot be saved, so no run was started.",
    );
  }

  return startTestRun(cliArguments, {
    convexUrl: CONVEX_URL,
    writeSecret,
  });
}

function resolveWriteSecret(): string | undefined {
  const fromAstroEnv = CONVEX_WRITE_SECRET?.trim();
  if (fromAstroEnv) {
    return fromAstroEnv;
  }

  loadE2eEnvironment();
  return process.env["CONVEX_WRITE_SECRET"]?.trim() || undefined;
}

export function getRunErrorResponse(error: unknown): {
  status: 400 | 409 | 500;
  message: string;
} | null {
  if (error instanceof InvalidArgumentsError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof RunAlreadyActiveError) {
    return { status: 409, message: error.message };
  }
  if (error instanceof MissingWriteSecretError) {
    return { status: 500, message: error.message };
  }
  return null;
}
