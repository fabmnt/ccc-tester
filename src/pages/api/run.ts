import type { APIRoute } from "astro";
import { CONVEX_URL, CONVEX_WRITE_SECRET } from "astro:env/server";
import { z } from "zod";
import { isKnownCliOption, MODES } from "../../../e2e/cli-arguments.js";
import { loadE2eEnvironment } from "../../../e2e/test-config.js";
import { TEST_SCOPES } from "../../../convex/validators.js";
import {
  buildCliArguments,
  InvalidArgumentsError,
  RunAlreadyActiveError,
  startTestRun,
  validateTestRunArguments,
} from "../../lib/test-runner.js";

const runRequestSchema = z
  .object({
    mode: z.enum(MODES).optional(),
    clientId: z.string().optional(),
    clinicId: z.string().optional(),
    executionId: z.string().optional(),
    executionSheet: z.string().optional(),
    baseUrl: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    devApiBaseUrl: z.string().optional(),
    productionApiBaseUrl: z.string().optional(),
    scope: z.enum(TEST_SCOPES).optional(),
    route: z.string().optional(),
    playwrightArguments: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const cliOption = value.playwrightArguments?.find(isKnownCliOption);
    if (cliOption !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["playwrightArguments"],
        message: `must not contain ccc-tester options, found "${cliOption}"`,
      });
    }
  });

type TestRunPayload = z.infer<typeof runRequestSchema>;

/**
 * POST /api/run — starts a ccc-tester run in the background.
 *
 * Payload (JSON): structured CLI options, e.g.
 *   { "mode": "all", "clientId": "client", "clinicId": "clinic",
 *     "executionId": "execution", "executionSheet": "2026-08-28",
 *     "playwrightArguments": ["--headed"] }
 * All fields are optional except the ones the CLI requires (client/clinic/
 * execution ids and sheet). Results saving is always enabled, so the run
 * fails fast with 500 when CONVEX_WRITE_SECRET is not configured.
 *
 * Responses: 202 { runId } — results appear at /tests once saved.
 * 400 invalid payload/arguments, 409 a run is already active, 500 missing config.
 * Requires the server to run from the project root (Playwright config and
 * report paths are cwd-relative).
 */
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Payload must be valid JSON." });
  }

  const parseOutcome = parseRunRequest(body);
  if (typeof parseOutcome === "string") {
    return jsonResponse(400, { error: parseOutcome });
  }

  const cliArguments = buildCliArguments(parseOutcome);
  try {
    validateTestRunArguments(cliArguments);
  } catch (error) {
    if (error instanceof InvalidArgumentsError) {
      return jsonResponse(400, { error: error.message });
    }
    throw error;
  }

  const writeSecret = resolveWriteSecret();
  if (!writeSecret) {
    return jsonResponse(500, {
      error:
        "CONVEX_WRITE_SECRET is not configured. Test results cannot be saved, so no run was started.",
    });
  }

  try {
    const runId = startTestRun(cliArguments, {
      convexUrl: CONVEX_URL,
      writeSecret,
    });
    return jsonResponse(202, { runId });
  } catch (error) {
    if (error instanceof RunAlreadyActiveError) {
      return jsonResponse(409, { error: error.message });
    }
    if (error instanceof InvalidArgumentsError) {
      return jsonResponse(400, { error: error.message });
    }
    throw error;
  }
};

function parseRunRequest(body: unknown): TestRunPayload | string {
  const result = runRequestSchema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  return result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function resolveWriteSecret(): string | undefined {
  const fromAstroEnv = CONVEX_WRITE_SECRET?.trim();
  if (fromAstroEnv) {
    return fromAstroEnv;
  }

  loadE2eEnvironment();
  return process.env["CONVEX_WRITE_SECRET"]?.trim() || undefined;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
