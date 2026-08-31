import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  modeValidator,
  testResultValidator,
  type TestMode,
  type TestResult,
} from "./validators";

const WRITE_SECRET_ENV_VAR = "CONVEX_WRITE_SECRET";

// Convex document IDs are lowercase alphanumeric strings.
const CONVEX_ID_PATTERN = /^[a-z0-9]{16,}$/;

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("runChecks")
      .withIndex("by_started_at")
      .order("desc")
      .collect();
  },
});

/** Run summaries for the results table, newest run first (bounded to 100). */
export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_started_at")
      .order("desc")
      .take(100);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    if (!CONVEX_ID_PATTERN.test(id)) {
      return null;
    }
    try {
      return await ctx.db.get("runChecks", id as Id<"runChecks">);
    } catch {
      return null;
    }
  },
});

export const save = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    mode: modeValidator,
    results: v.array(testResultValidator),
  },
  handler: async (ctx, { secret, runId, mode, results }) => {
    if (secret !== process.env[WRITE_SECRET_ENV_VAR]) {
      throw new ConvexError(
        `Invalid or missing write secret. Set ${WRITE_SECRET_ENV_VAR} in the deployment environment.`,
      );
    }

    const existingRun = await ctx.db
      .query("runChecks")
      .withIndex("by_run_id_and_mode", (query) =>
        query.eq("runId", runId).eq("mode", mode),
      )
      .first();
    if (existingRun !== null) {
      return { saved: 0, skipped: true };
    }

    await upsertRunDoc(ctx, runId, mode, results);

    for (const result of results) {
      await ctx.db.insert("runChecks", { ...result, runId });
    }

    return { saved: results.length, skipped: false };
  },
});

/** Create or extend the run document for a run/mode save. */
async function upsertRunDoc(
  ctx: MutationCtx,
  runId: string,
  mode: TestMode,
  results: TestResult[],
): Promise<void> {
  const firstResult = results[0];
  const earliestStart = Math.min(...results.map((result) => result.startedAt));
  const savedAt = Date.now();
  const passedCount = results.filter(
    (result) => result.status === "passed",
  ).length;
  const commitHash = results.find((result) => result.commitHash)?.commitHash;

  const existingRun = await ctx.db
    .query("runs")
    .withIndex("by_run_id", (query) => query.eq("runId", runId))
    .unique();
  if (existingRun === null) {
    await ctx.db.insert("runs", {
      runId,
      modes: [mode],
      startedAt: earliestStart,
      finishedAt: savedAt,
      checks: results.length,
      passed: passedCount,
      durationMs: savedAt - earliestStart,
      commitHash,
      clientId: firstResult.clientId,
      clinicId: firstResult.clinicId,
      executionId: firstResult.executionId,
      sheetName: firstResult.sheetName,
    });
    return;
  }

  const modes = existingRun.modes.includes(mode)
    ? existingRun.modes
    : [...existingRun.modes, mode];
  const startedAt = Math.min(existingRun.startedAt, earliestStart);
  const finishedAt = Math.max(existingRun.finishedAt, savedAt);
  await ctx.db.patch("runs", existingRun._id, {
    modes,
    checks: existingRun.checks + results.length,
    passed: existingRun.passed + passedCount,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    commitHash: existingRun.commitHash ?? commitHash,
  });
}

/**
 * One-time backfill: creates a run document for every runId that only exists
 * as check rows (data saved before the runs table existed).
 */
export const backfillRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statsByRunId = new Map<
      string,
      {
        checks: number;
        passed: number;
        startedAt: number;
        finishedAt: number;
        modes: TestMode[];
        commitHash?: string;
        first: Doc<"runChecks">;
      }
    >();
    for await (const check of ctx.db.query("runChecks")) {
      const stats = statsByRunId.get(check.runId);
      if (!stats) {
        statsByRunId.set(check.runId, {
          startedAt: check.startedAt,
          finishedAt: check.startedAt + check.durationMs,
          modes: [check.mode],
          commitHash: check.commitHash,
          checks: 1,
          passed: check.status === "passed" ? 1 : 0,
          first: check,
        });
        continue;
      }
      stats.checks += 1;
      if (check.status === "passed") {
        stats.passed += 1;
      }
      stats.startedAt = Math.min(stats.startedAt, check.startedAt);
      stats.finishedAt = Math.max(
        stats.finishedAt,
        check.startedAt + check.durationMs,
      );
      if (!stats.modes.includes(check.mode)) {
        stats.modes.push(check.mode);
      }
      stats.commitHash ??= check.commitHash;
    }

    let created = 0;
    for (const [runId, stats] of statsByRunId) {
      const existing = await ctx.db
        .query("runs")
        .withIndex("by_run_id", (query) => query.eq("runId", runId))
        .unique();
      if (existing !== null) {
        continue;
      }
      await ctx.db.insert("runs", {
        runId,
        modes: stats.modes,
        startedAt: stats.startedAt,
        finishedAt: stats.finishedAt,
        checks: stats.checks,
        passed: stats.passed,
        durationMs: stats.finishedAt - stats.startedAt,
        commitHash: stats.commitHash,
        clientId: stats.first.clientId,
        clinicId: stats.first.clinicId,
        executionId: stats.first.executionId,
        sheetName: stats.first.sheetName,
      });
      created += 1;
    }
    return { created };
  },
});
