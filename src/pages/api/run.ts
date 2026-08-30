import type { APIRoute } from "astro";
import { parseRunRequest } from "../../lib/run-request.js";
import {
  getRunErrorResponse,
  startRunFromRequest,
} from "../../lib/run-service.js";

/**
 * POST /api/run — starts a ccc-tester run in the background.
 *
 * The dashboard form uses the equivalent `runTests` Astro action. This route
 * stays available for scripts and other clients that use the documented HTTP
 * API.
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

  try {
    const runId = startRunFromRequest(parseOutcome);
    return jsonResponse(202, { runId });
  } catch (error) {
    const response = getRunErrorResponse(error);
    if (response) {
      return jsonResponse(response.status, { error: response.message });
    }
    throw error;
  }
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
