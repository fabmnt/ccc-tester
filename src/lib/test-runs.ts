import type { RunCheckDoc } from "@/lib/convex";

/**
 * Groups check results by run id so a run row can expand into its checks.
 * Insertion order follows the input order (newest check first).
 */
export function groupChecksByRun(
  results: RunCheckDoc[],
): Map<string, RunCheckDoc[]> {
  const checksByRun = new Map<string, RunCheckDoc[]>();
  for (const result of results) {
    const checks = checksByRun.get(result.runId);
    if (checks) {
      checks.push(result);
    } else {
      checksByRun.set(result.runId, [result]);
    }
  }
  return checksByRun;
}
